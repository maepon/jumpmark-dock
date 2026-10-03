#!/bin/bash
# Runs make check for this repository on its own. Used both locally and in CI (.github/workflows/check.yml).
# Usage: ./scripts/ci-check.sh (run at the repository root)
#
# The flow expects to live in a subdirectory of a host repository, with project settings (.ai-flow/) at the root
# (scripts/flow-paths.sh). In this repository the flow is at the root, so make check would stop with
# "The flow is at the repository root". So this creates a throwaway git repository, lays the files out like a host
# (the flow under ai-flow/, examples/project/.ai-flow/ at the root), and runs make check there.
# This also verifies that the template config.mk passes make check.
#
# It copies the files git tracks plus new files that are not ignored (including uncommitted changes).
# .env and tmp/ are not brought along.
set -uo pipefail

SRC=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d) || { echo "NG: could not create a temporary directory." >&2; exit 1; }
trap 'rm -rf "${WORK}"' EXIT

HOST="${WORK}/host"
FLOW="${HOST}/ai-flow"
mkdir -p "${FLOW}"
git -C "${HOST}" init -q
# The Makefile builds the Issue URL from origin, so add an origin like a host would have (never contacted)
git -C "${HOST}" remote add origin https://github.com/example/host.git

git -C "${SRC}" ls-files -z --cached --others --exclude-standard | while IFS= read -r -d '' f; do
  [ -f "${SRC}/${f}" ] || continue   # skip files deleted in the working tree
  mkdir -p "${FLOW}/$(dirname "${f}")"
  cp -p "${SRC}/${f}" "${FLOW}/${f}"
done

[ -d "${SRC}/examples/project/.ai-flow" ] \
  || { echo "NG: examples/project/.ai-flow is missing." >&2; exit 1; }
cp -R "${SRC}/examples/project/.ai-flow" "${HOST}/.ai-flow"

git -C "${HOST}" add -A
git -C "${HOST}" -c user.name=ci -c user.email=ci@example.com -c commit.gpgsign=false commit -q -m "ci-check"

make -C "${FLOW}" check || exit 1

# Projects without a formatter (all FORMAT_* empty) and / or without tests (TEST_CMD and SCRATCH_TEST_CMD empty)
# must also render their prompts and pass make check
echo "--- running again with all FORMAT_* empty"
make -C "${FLOW}" check FORMAT_CHECK_CMD= FORMAT_FILE_CMD= FORMAT_FIX_CMD= FORMAT_GLOBS= || exit 1
echo "--- running again with TEST_CMD / SCRATCH_TEST_CMD empty"
make -C "${FLOW}" check TEST_CMD= SCRATCH_TEST_CMD= || exit 1
echo "--- running again with no tests and no formatter"
make -C "${FLOW}" check TEST_CMD= SCRATCH_TEST_CMD= FORMAT_CHECK_CMD= FORMAT_FILE_CMD= FORMAT_FIX_CMD= FORMAT_GLOBS=
