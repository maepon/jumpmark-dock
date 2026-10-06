#!/bin/bash
# FORMAT_FILE_CMD for Go: exits 0 when the file is formatted. `gofmt -l` answers through its output (exit 0 either way),
# and the flow reads only the exit code. Check only; it never formats.
#
# Usage: ../.ai-flow/gofmt-file.sh <file>    (copy it to .ai-flow/ at the repository root; see go-test.sh for why)
# Exit code: 0 formatted / 1 not formatted / 2 gofmt itself failed (e.g. a syntax error; the flow stops on it too)
out=$(gofmt -l "${1:?a file is required}") || exit 2
[ -z "${out}" ] || exit 1
