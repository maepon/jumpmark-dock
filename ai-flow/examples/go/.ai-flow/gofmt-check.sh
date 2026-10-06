#!/bin/bash
# FORMAT_CHECK_CMD for Go: `gofmt -l` lists unformatted files but exits 0 either way, so this turns its output into
# the exit code. Checks every .go file in the working tree (tracked or new, not ignored), from any directory.
#
# Usage: ../.ai-flow/gofmt-check.sh    (copy it to .ai-flow/ at the repository root; see go-test.sh for why)
# Exit code: 0 all formatted / 1 unformatted files (listed on stdout) / 2 gofmt itself failed (e.g. a syntax error)
set -uo pipefail

root=$(git rev-parse --show-toplevel) || exit 2
cd "${root}" || exit 2

files=()
while IFS= read -r -d '' f; do
  files+=("${f}")
done < <(git ls-files -z --cached --others --exclude-standard -- '*.go')
[ "${#files[@]}" -gt 0 ] || exit 0

out=$(gofmt -l "${files[@]}") || exit 2
[ -z "${out}" ] || { printf '%s\n' "${out}"; exit 1; }
