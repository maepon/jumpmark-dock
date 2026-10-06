#!/bin/bash
# TEST_CMD for a Go repository with several modules and no go.work (each directory with a go.mod is its own module).
# `go test ../<module>/...` from the flow directory fails there ("directory prefix ... does not contain main module"),
# so this runs `go test -count=1 ./...` inside each module and fails if any of them fails.
#
# Usage (from the flow directory, as the agents run it):
#   ../.ai-flow/go-test.sh               every module in the repository
#   ../.ai-flow/go-test.sh <dir>...      only these modules (directories relative to the repository root)
#
# Copy it to .ai-flow/ at the repository root, not to the project's own scripts/: .ai-flow/ is tooling, so the agents cannot
# rewrite it (the working tree check stops them), while a script the agents can edit could be made to pass the judges' re-run.
# -count=1 disables the test cache, because the judges re-run the tests to verify claims (docs/setup.md §9).
set -uo pipefail

root=$(git rev-parse --show-toplevel) || exit 2
cd "${root}" || exit 2

modules=()
if [ "$#" -gt 0 ]; then
  modules=("$@")
else
  # go.mod files in the working tree, tracked or new (not ignored)
  while IFS= read -r -d '' mod; do
    modules+=("$(dirname "${mod}")")
  done < <(git ls-files -z --cached --others --exclude-standard -- 'go.mod' '**/go.mod')
fi
[ "${#modules[@]}" -gt 0 ] || { echo "go-test.sh: no go.mod found." >&2; exit 2; }

failed=()
for dir in "${modules[@]}"; do
  [ -f "${dir}/go.mod" ] || { echo "go-test.sh: ${dir}/go.mod not found." >&2; failed+=("${dir}"); continue; }
  echo "--- go test ${dir}" >&2
  (cd "${dir}" && go test -count=1 ./...) || failed+=("${dir}")
done

if [ "${#failed[@]}" -gt 0 ]; then
  echo "go-test.sh: failed in: ${failed[*]}" >&2
  exit 1
fi
