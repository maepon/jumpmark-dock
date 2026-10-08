#!/bin/bash
# Regression tests for run-phase.sh functions. Called at the end of check-scripts.sh (runs on every make check).
# Usage: ./scripts/selftest.sh (run in the flow directory)
#
# What is checked here are tooling bugs of the kind that "only show when run". Each one actually happened and is pinned here.
#   - TOOLING_PATHS / unformatted_files misreading root-relative paths from the flow directory
#   - Dependence on the flow directory's name and depth (renaming it let modifications to tooling files through)
#   - require_instruction / ensure_pr_url turning a gh failure into an error that means something else
#   - Tooling commits already on the local BASE_BRANCH being noticed only in create_pr, after every step was paid for
#   - The judges' NEEDS_HUMAN stopping without waiting for more rounds
#   - Handling of the formatting commands and target patterns from the project settings (.ai-flow/config.mk),
#     and how render-prompt.sh fills placeholders
#   - The notification contract (what NOTIFY_CMD receives, and that a failing one does not stop the flow), and that
#     claude-run.sh keeps the notification secrets (NOTIFY_SECRET_VARS) out of the agent's environment
#   - notify-slack.sh's conversion of **bold**, which did not show as bold in Japanese text
#   - notify-google-chat.sh's payload: Unicode emoji, the same **bold** conversion, and cutting a body that is too large
#   - The Go wrappers in examples/go/.ai-flow (several modules without go.work; gofmt -l answering through its output)
#
# Sourcing run-phase.sh would run its body, so only the functions under test and the TOOLING_PATHS definition are extracted
# with sed and sourced. If the way functions are written changes (name() { ... } with the } at the start of a line) and extraction
# fails, the tests fail rather than passing silently.
# gh, npx, claude and curl are replaced by stubs placed first in PATH, so neither the network nor any cost is involved.
set -uo pipefail

# Use the same formatting settings as a Node.js project (npx is a stub). Do not depend on the project settings' values
export FORMAT_FILE_CMD="npx prettier --check"
export FORMAT_GLOBS="*.js *.css *.html"

SRC="$(pwd)/scripts/run-phase.sh"
FLOW_PATHS="$(pwd)/scripts/flow-paths.sh"
[ -f "${SRC}" ] || { echo "NG: ${SRC} is missing. Run in the flow directory." >&2; exit 1; }

status=0
pass=0
ng() { echo "NG: $1" >&2; status=1; }

WORK=$(mktemp -d) || { echo "NG: could not create a temporary directory." >&2; exit 1; }
trap 'rm -rf "${WORK}"' EXIT

# --- Extract what is under test -------------------------------------------------------------
LIB="${WORK}/lib.sh"
grep '^TOOLING_PATHS=' "${SRC}" > "${LIB}"
[ -s "${LIB}" ] || ng "Could not extract the TOOLING_PATHS definition from run-phase.sh."
FUNCS="worktree_paths tooling_state format_target format_ok unformatted_files require_instruction ensure_pr_url handle_verdict notify
  require_base mixed_tooling require_no_mixed_tooling phase_impl phase_review model_id read_verdict"
for fn in ${FUNCS}; do
  body=$(sed -n "/^${fn}() {/,/^}/p" "${SRC}")
  if [ -z "${body}" ]; then
    ng "Could not extract function ${fn} from run-phase.sh (its definition may have changed shape)."
    continue
  fi
  printf '%s\n' "${body}" >> "${LIB}"
done
[ "${status}" -eq 0 ] || exit 1

# --- Stubs -----------------------------------------------------------------------------------
BIN="${WORK}/bin"
mkdir -p "${BIN}"

# gh: behavior switched by GH_MODE
cat > "${BIN}/gh" <<'EOF'
#!/bin/sh
case "${GH_MODE:-}" in
  issue_tag)   printf 'author:\tx\n--\n<!-- AI-TAG: INSTRUCTION -->\n\n# Instruction\n' ;;
  issue_notag) printf 'author:\tx\n--\nonly mentions <!-- AI-TAG: INSTRUCTION --> in the body\n' ;;
  fail)        echo "HTTP 401: Bad credentials (https://api.github.com/graphql)" >&2; exit 1 ;;
  pr_nopr)     echo 'no pull requests found for branch "master"' >&2; exit 1 ;;
  pr_warn)     echo "A new release of gh is available" >&2; echo "https://github.com/o/r/pull/9" ;;
  *)           echo "gh stub: GH_MODE is not set" >&2; exit 99 ;;
esac
EOF

# npx prettier --check <file>: fails if the file is missing or contains UNFORMATTED
cat > "${BIN}/npx" <<'EOF'
#!/bin/sh
f=""
for a in "$@"; do f="$a"; done
[ -f "$f" ] || exit 2
grep -q UNFORMATTED "$f" && exit 1
exit 0
EOF
# notify-stub: a NOTIFY_CMD that records its arguments, the AI_FLOW_NOTIFY_* variables and stdin in NOTIFY_OUT
cat > "${BIN}/notify-stub" <<'EOF'
#!/bin/sh
{
  echo "ARGS=$*"
  echo "KIND=${AI_FLOW_NOTIFY_KIND}"
  echo "TITLE=${AI_FLOW_NOTIFY_TITLE}"
  echo "PHASE=${AI_FLOW_NOTIFY_PHASE}"
  echo "URL=${AI_FLOW_NOTIFY_ISSUE_URL}"
  echo "BODY:"
  cat
} > "${NOTIFY_OUT}"
EOF

# claude: reports which of the listed variables it can see, as claude -p --output-format json would reply
cat > "${BIN}/claude" <<'EOF'
#!/bin/sh
seen=""
for v in SLACK_WEBHOOK_URL GOOGLE_CHAT_WEBHOOK_URL DISCORD_WEBHOOK_URL OTHER_SECRET KEEP_ME; do
  eval "x=\${$v+set}"
  [ -n "$x" ] && seen="$seen $v"
done
printf '{"total_cost_usd":0,"num_turns":1,"permission_denials":[],"is_error":false,"result":"SEEN:%s"}\n' "$seen"
EOF
chmod +x "${BIN}/gh" "${BIN}/npx" "${BIN}/notify-stub" "${BIN}/claude"

# Runs one case in a separate process and returns its output (stdout+stderr) and exit code.
# fail / halt are not run-phase.sh's definitions but stubs that print a recognizable marker and end.
run_case() {
  local dir="$1" body="$2"
  ( cd "${dir}" && PATH="${BIN}:${PATH}" /bin/bash -c "
      set -uo pipefail
      PHASE=selftest; ISSUE=9; RESULT=''; PR_URL=\"\${PR_URL:-}\"
      fail() { echo \"FAIL:\$1\"; exit 1; }
      halt() { echo \"HALT:\$1\"; exit 0; }
      . '${FLOW_PATHS}'
      source '${LIB}'
      ${body}
    " 2>&1 )
}

# Expect: the output contains needle and the exit code is code
expect() {
  local name="$1" code="$2" needle="$3" out="$4" got="$5"
  if [ "${got}" != "${code}" ]; then
    ng "${name}: exit code ${got} (expected ${code}). Output: ${out}"
  elif [ -n "${needle}" ] && ! printf '%s' "${out}" | grep -qF -- "${needle}"; then
    ng "${name}: \"${needle}\" not in the output. Output: ${out}"
  else
    pass=$((pass + 1))
  fi
}

# --- Throwaway repositories (run from the flow directory, as in real use) ---
# Commits here pass -c commit.gpgsign=false: the user's signing setup (e.g. a 1Password SSH agent) must not decide whether the tests pass
# To catch bugs that depend on the flow directory's name (such as a hard-coded TOOLING_PATHS), run twice with different names and depths.
#   ai-flow        the common layout
#   tools/ai.flow  depth 2, with a regex metacharacter (.) in the name. Forgetting to escape it would treat tools/aiXflow/ as tooling too
repo_suite() {
  local F="$1" REPO="${WORK}/repo-$2" decoy=""
  mkdir -p "${REPO}/${F}/scripts" "${REPO}/${F}/docs" "${REPO}/docs" "${REPO}/test" "${REPO}/web" "${REPO}/.ai-flow"
  git -C "${REPO}" init -q
  echo 'x' > "${REPO}/${F}/scripts/a.sh"
  echo 'x' > "${REPO}/${F}/docs/g.md"
  printf 'tmp/\n.env\n' > "${REPO}/${F}/.gitignore"          # ignores tmp/ and .env like the real flow's .gitignore
  echo 'x' > "${REPO}/${F}/README.md"
  echo 'x' > "${REPO}/docs/pp.md"
  echo 'x' > "${REPO}/docs/日本語 ファイル.md"                 # non-ASCII and a space on purpose: git quotes such paths without -z
  echo 'x' > "${REPO}/README.md"
  echo 'x' > "${REPO}/.gitignore"
  echo 'x' > "${REPO}/.ai-flow/permissions.json"
  echo 'const a = 1;' > "${REPO}/test/x.js"
  case "${F}" in *.*) decoy=$(printf '%s' "${F}" | tr '.' 'X'); mkdir -p "${REPO}/${decoy}/scripts"; echo 'x' > "${REPO}/${decoy}/scripts/a.sh" ;; esac
  git -C "${REPO}" add -A
  git -C "${REPO}" -c user.name=t -c user.email=t@example.com -c commit.gpgsign=false commit -q -m init

  # Change project files and tooling files together
  echo 'y' >> "${REPO}/docs/pp.md"
  echo 'y' >> "${REPO}/docs/日本語 ファイル.md"
  echo 'y' >> "${REPO}/README.md"
  echo 'y' >> "${REPO}/${F}/scripts/a.sh"
  echo 'y' >> "${REPO}/${F}/.gitignore"                     # the flow's .gitignore is tooling too
  echo 'y' >> "${REPO}/.gitignore"                          # the root .gitignore stays protected
  echo 'y' >> "${REPO}/.ai-flow/permissions.json"           # project settings (extra permissions) are tooling too
  echo 'new' > "${REPO}/${F}/docs/new.md"
  echo 'y' >> "${REPO}/${F}/README.md"                      # everything in the flow directory is tooling
  mkdir -p "${REPO}/${F}/examples/project"
  echo 'new' > "${REPO}/${F}/examples/project/x.md"
  mkdir -p "${REPO}/${F}/tmp" && echo 'w' > "${REPO}/${F}/tmp/work.md"   # scratch files are ignored by the flow's .gitignore
  git -C "${REPO}" mv "${F}/docs/g.md" docs/g.md            # moving a file out of the tooling is a tooling change too
  echo 'UNFORMATTED' >> "${REPO}/test/x.js"                # make an existing file unformatted
  echo 'UNFORMATTED' > "${REPO}/web/a b.js"                # a new unformatted file with a space in its name
  echo 'const ok = 1;' > "${REPO}/web/ok.js"               # a new formatted file
  echo 'UNFORMATTED' > "${REPO}/${F}/docs/note.md"         # an extension not subject to the check
  [ -z "${decoy}" ] || echo 'y' >> "${REPO}/${decoy}/scripts/a.sh"   # a project file whose name only looks similar

  # --- flow-paths.sh ---
  local depth_rel
  depth_rel=$(printf '%s/' "${F}" | sed -e 's,[^/][^/]*/,../,g')
  out=$(run_case "${REPO}/${F}" 'printf "%s|%s|%s|%s" "${FLOW_PREFIX}" "${FLOW_DIR}" "${ROOT_REL}" "${flow_paths_error}"'); got=$?
  expect "flow-paths (${F})" 0 "${F}/|${F}|${depth_rel}|" "${out}" "${got}"

  # --- tooling_state ---
  out=$(run_case "${REPO}/${F}" 'tooling_state'); got=$?
  expected=$(printf '%s\n' .ai-flow/permissions.json .gitignore "${F}/.gitignore" "${F}/README.md" "${F}/docs/g.md" "${F}/docs/new.md" "${F}/docs/note.md" "${F}/examples/project/x.md" "${F}/scripts/a.sh" | LC_ALL=C sort)
  if [ "${got}" -ne 0 ] || [ "$(printf '%s\n' "${out}" | LC_ALL=C sort)" != "${expected}" ]; then
    ng "tooling_state: the tooling files detected differ from what was expected (run from ${F}/).
Expected:
${expected}
Actual:
${out}"
  else
    pass=$((pass + 1))
  fi

  # --- unformatted_files ---
  out=$(run_case "${REPO}/${F}" 'unformatted_files'); got=$?
  expected=$(printf '%s\n' test/x.js 'web/a b.js')
  if [ "${got}" -ne 0 ] || [ "$(printf '%s' "${out}" | sort)" != "${expected}" ]; then
    ng "unformatted_files: unformatted files detected differ from what was expected (run from ${F}/; are root-relative paths handled?).
Expected:
${expected}
Actual:
${out}"
  else
    pass=$((pass + 1))
  fi

  # --- Formatting settings ---
  out=$(FORMAT_FILE_CMD='' run_case "${REPO}/${F}" 'unformatted_files; echo END'); got=$?
  expect "unformatted_files (no formatting check when FORMAT_FILE_CMD is empty)" 0 "END" "${out}" "${got}"
  [ "${out}" = "END" ] || ng "unformatted_files (FORMAT_FILE_CMD empty): expected no output but got \"${out}\"."
  out=$(FORMAT_FILE_CMD='false' run_case "${REPO}/${F}" 'unformatted_files'); got=$?
  expected=$(printf '%s\n' test/x.js 'web/a b.js' web/ok.js)
  if [ "${got}" -ne 0 ] || [ "$(printf '%s' "${out}" | sort)" != "${expected}" ]; then
    ng "unformatted_files (if the check itself fails, treat files as unformatted and stop): differs from what was expected.
Expected:
${expected}
Actual:
${out}"
  else
    pass=$((pass + 1))
  fi
}
repo_suite ai-flow 1
repo_suite tools/ai.flow 2
REPO="${WORK}/repo-1"   # the ensure_pr_url cases below run inside a git repository

# --- flow-paths.sh (stops when placed at the root) ---
mkdir -p "${WORK}/rootflow"
git -C "${WORK}/rootflow" init -q
out=$(run_case "${WORK}/rootflow" 'echo "ERR=${flow_paths_error}"'); got=$?
expect "flow-paths (returns the reason when placed at the root)" 0 "ERR=The flow is at the repository root" "${out}" "${got}"
# Even with a file matching *.js in the current directory, the pattern does not turn into that file name
echo 'x' > "${WORK}/here.js"
out=$(run_case "${WORK}" 'format_target web/y.js && echo TARGET'); got=$?
expect "format_target (the pattern is not expanded to file names in the current directory)" 0 "TARGET" "${out}" "${got}"
out=$(run_case "${WORK}" 'format_target docs/y.md || echo NOT_TARGET'); got=$?
expect "format_target (extension not subject to the check)" 0 "NOT_TARGET" "${out}" "${got}"
out=$(FORMAT_GLOBS='' run_case "${WORK}" 'format_target web/y.js || echo NOT_TARGET'); got=$?
expect "format_target (nothing is a target when FORMAT_GLOBS is empty)" 0 "NOT_TARGET" "${out}" "${got}"

# --- render-prompt.sh ---
RENDER="$(pwd)/scripts/render-prompt.sh"
PROJ="${WORK}/proj"
mkdir -p "${PROJ}"
printf '## Context\nTests: `{{TEST_CMD}}`\n' > "${PROJ}/context.md"
printf '%s\n' '- item 1' > "${PROJ}/risk-catalog.md"
printf '%s\n' 'usage' > "${PROJ}/user-flows.md"
printf '%s\n' '# P {{ISSUE}}' 'a {{RISK_CATALOG}} in the middle of a line is not replaced' '{{RISK_CATALOG}}' > "${WORK}/p.md"
printf '%s\n' '## R' '{{PROJECT_CONTEXT}}' > "${WORK}/r.md"
render() {
  ( cd "${WORK}" && env AI_FLOW_PROJECT_DIR="${PROJ}" ISSUE=7 TEST_CMD='a && b | c/d \e' "$@" 2>&1 )
}
# A {{RISK_CATALOG}} in the middle of a line is not replaced with the file (it remains, so it fails as unfilled)
out=$(render "${RENDER}" p.md r.md); got=$?
expect "render-prompt (stops on unfilled placeholders)" 1 "unfilled placeholders: {{RISK_CATALOG}}" "${out}" "${got}"
printf '%s\n' '# P {{ISSUE}}' '{{TEST_CMD}}' '{{RISK_CATALOG}}' > "${WORK}/p.md"
out=$(render "${RENDER}" p.md r.md); got=$?
expected=$(printf '%s\n' '# P 7' 'a && b | c/d \e' '- item 1' '' '## R' '## Context' 'Tests: `a && b | c/d \e`')
if [ "${got}" -ne 0 ] || [ "${out}" != "${expected}" ]; then
  ng "render-prompt (& | / \\ in values, file includes, joining with a blank line): differs from what was expected.
Expected:
${expected}
Actual:
${out}"
else
  pass=$((pass + 1))
fi
out=$(render env TEST_CMD= "${RENDER}" p.md r.md); got=$?
expect "render-prompt (stops on an empty value)" 1 "TEST_CMD is empty" "${out}" "${got}"
mv "${PROJ}/risk-catalog.md" "${PROJ}/risk-catalog.md.bak"
out=$(render "${RENDER}" p.md r.md); got=$?
expect "render-prompt (stops when a project settings file is missing)" 1 "risk-catalog.md is unreadable or empty" "${out}" "${got}"

# --- Conditional blocks in render-prompt.sh ({{#if NAME}} ... {{/if}}) ---
# An empty value removes the whole block (an empty placeholder inside does not stop it); otherwise only the marker lines go
printf '%s\n' 'A' '{{#if FORMAT_CHECK_CMD}}' 'fmt `{{FORMAT_CHECK_CMD}}`' '{{/if}}' 'B {{ISSUE}}' > "${WORK}/c.md"
out=$(render env FORMAT_CHECK_CMD= "${RENDER}" c.md); got=$?
if [ "${got}" -ne 0 ] || [ "${out}" != "$(printf '%s\n' A 'B 7')" ]; then
  ng "render-prompt (an empty value removes the whole block): differs from what was expected (exit code ${got}).
Actual:
${out}"
else
  pass=$((pass + 1))
fi
out=$(render env FORMAT_CHECK_CMD='x --check' "${RENDER}" c.md); got=$?
if [ "${got}" -ne 0 ] || [ "${out}" != "$(printf '%s\n' A 'fmt `x --check`' 'B 7')" ]; then
  ng "render-prompt (with a value, only the marker lines are removed): differs from what was expected (exit code ${got}).
Actual:
${out}"
else
  pass=$((pass + 1))
fi
printf '%s\n' '{{#if FORMAT_CHECK_CMD}}' 'x' > "${WORK}/c1.md"
out=$(render env FORMAT_CHECK_CMD=x "${RENDER}" c1.md); got=$?
expect "render-prompt (stops on an unclosed block)" 1 "{{#if FORMAT_CHECK_CMD}} is not closed" "${out}" "${got}"
printf '%s\n' '{{#if FORMAT_CHECK_CMD}}' '{{#if TEST_CMD}}' 'x' '{{/if}}' '{{/if}}' > "${WORK}/c2.md"
out=$(render env FORMAT_CHECK_CMD=x "${RENDER}" c2.md); got=$?
expect "render-prompt (stops on nesting)" 1 "cannot be nested" "${out}" "${got}"
printf '%s\n' '{{#if NO_SUCH_KEY}}' 'x' '{{/if}}' > "${WORK}/c3.md"
out=$(render "${RENDER}" c3.md); got=$?
expect "render-prompt (stops on a name that is not a value placeholder)" 1 "is not a value placeholder" "${out}" "${got}"
printf '%s\n' 'x' '{{/if}}' > "${WORK}/c4.md"
out=$(render "${RENDER}" c4.md); got=$?
expect "render-prompt (stops on {{/if}} without a match)" 1 "{{/if}} without a matching {{#if ...}}" "${out}" "${got}"

# {{#unless NAME}} ... {{/unless}}: kept only when the value is empty (the wording for projects without tests)
printf '%s\n' 'A' '{{#if TEST_CMD}}' 'tests `{{TEST_CMD}}`' '{{/if}}' '{{#unless TEST_CMD}}' 'no tests' '{{/unless}}' 'Z' > "${WORK}/u.md"
out=$(render env TEST_CMD= "${RENDER}" u.md); got=$?
if [ "${got}" -ne 0 ] || [ "${out}" != "$(printf '%s\n' A 'no tests' Z)" ]; then
  ng "render-prompt ({{#unless}} is kept when the value is empty): differs from what was expected (exit code ${got}).
Actual:
${out}"
else
  pass=$((pass + 1))
fi
out=$(render env TEST_CMD='t --all' "${RENDER}" u.md); got=$?
if [ "${got}" -ne 0 ] || [ "${out}" != "$(printf '%s\n' A 'tests `t --all`' Z)" ]; then
  ng "render-prompt ({{#unless}} is removed when the value is set): differs from what was expected (exit code ${got}).
Actual:
${out}"
else
  pass=$((pass + 1))
fi
printf '%s\n' '{{#unless TEST_CMD}}' 'x' '{{/if}}' > "${WORK}/u2.md"
out=$(render "${RENDER}" u2.md); got=$?
expect "render-prompt (stops when {{/if}} closes {{#unless}})" 1 "{{/if}} closes {{#unless TEST_CMD}}" "${out}" "${got}"

# --- require_instruction ---
out=$(GH_MODE=issue_tag run_case "${WORK}" 'require_instruction && echo PASSED'); got=$?
expect "require_instruction (tag present)" 0 "PASSED" "${out}" "${got}"
out=$(GH_MODE=issue_notag run_case "${WORK}" 'require_instruction && echo PASSED'); got=$?
expect "require_instruction (no tag at the start of a line)" 1 "FAIL:Issue #9 has no instruction document" "${out}" "${got}"
out=$(GH_MODE=fail run_case "${WORK}" 'require_instruction && echo PASSED'); got=$?
expect "require_instruction (gh fails)" 1 "HTTP 401: Bad credentials" "${out}" "${got}"
expect "require_instruction (a gh failure is told apart from no instruction document)" 1 "Could not fetch Issue #9 with gh" "${out}" "${got}"

# --- ensure_pr_url ---
out=$(PR_URL=https://example.com/pull/1 GH_MODE=fail run_case "${REPO}" 'ensure_pr_url && echo "URL=${PR_URL}"'); got=$?
expect "ensure_pr_url (does not call gh when already set)" 0 "URL=https://example.com/pull/1" "${out}" "${got}"
out=$(GH_MODE=pr_nopr run_case "${REPO}" 'ensure_pr_url && echo "URL=${PR_URL}"'); got=$?
expect "ensure_pr_url (gh fails)" 1 'no pull requests found for branch "master"' "${out}" "${got}"
expect "ensure_pr_url (shows the branch name)" 1 "current branch:" "${out}" "${got}"
out=$(GH_MODE=pr_warn run_case "${REPO}" 'ensure_pr_url && echo "URL=[${PR_URL}]"'); got=$?
expect "ensure_pr_url (warnings on success do not get into the URL)" 0 "URL=[https://github.com/o/r/pull/9]" "${out}" "${got}"

# --- handle_verdict ---
out=$(run_case "${WORK}" 'handle_verdict APPROVED implementation "make review" && echo BREAK'); got=$?
expect "handle_verdict (APPROVED leaves the loop)" 0 "BREAK" "${out}" "${got}"
out=$(run_case "${WORK}" 'handle_verdict CHANGES_REQUESTED implementation "make review" || echo NEXT_ROUND'); got=$?
expect "handle_verdict (CHANGES_REQUESTED goes to the next round)" 0 "NEXT_ROUND" "${out}" "${got}"
out=$(run_case "${WORK}" 'handle_verdict NEEDS_HUMAN implementation "make review"; echo NOT_REACHED'); got=$?
expect "handle_verdict (NEEDS_HUMAN halts immediately)" 0 "HALT:The implementation verdict asks for a human decision" "${out}" "${got}"
if printf '%s' "${out}" | grep -qF NOT_REACHED; then ng "handle_verdict (NEEDS_HUMAN): processing continued after halt."; fi
out=$(run_case "${WORK}" 'handle_verdict "" implementation "make review"; echo NOT_REACHED'); got=$?
expect "handle_verdict (an empty verdict fails)" 1 "FAIL:Unexpected verdict file contents" "${out}" "${got}"

# --- notify (the contract every NOTIFY_CMD gets) ---
NOTIFY_OUT="${WORK}/notify-out.txt"
export NOTIFY_OUT
out=$(NOTIFY_CMD='notify-stub --opt' run_case "${WORK}" 'ISSUE_URL=https://example.com/issues/9
  notify waiting "spec - waiting for answers" "line 1
\"quoted\" \\ \$HOME **bold**"; echo AFTER'); got=$?
expect "notify (returns on success)" 0 "AFTER" "${out}" "${got}"
expected=$(printf '%s\n' 'ARGS=--opt' 'KIND=waiting' 'TITLE=spec - waiting for answers' 'PHASE=selftest' \
  'URL=https://example.com/issues/9' 'BODY:' 'line 1' '"quoted" \ $HOME **bold**')
if [ "$(cat "${NOTIFY_OUT}" 2>/dev/null)" != "${expected}" ]; then
  ng "notify (arguments, AI_FLOW_NOTIFY_* and the body on stdin): differs from what was expected.
Expected:
${expected}
Actual:
$(cat "${NOTIFY_OUT}" 2>/dev/null)"
else
  pass=$((pass + 1))
fi
out=$(NOTIFY_CMD='' run_case "${WORK}" 'ISSUE_URL=u; notify done t b; echo END'); got=$?
expect "notify (nothing happens when NOTIFY_CMD is empty)" 0 "END" "${out}" "${got}"
[ "${out}" = "END" ] || ng "notify (NOTIFY_CMD empty): expected no output but got \"${out}\"."
out=$(NOTIFY_CMD='false' run_case "${WORK}" 'ISSUE_URL=u; notify aborted t b; echo AFTER'); got=$?
expect "notify (a failing command only warns)" 0 "sending the notification failed" "${out}" "${got}"
expect "notify (a failing command does not stop the flow)" 0 "AFTER" "${out}" "${got}"
# A command that ignores stdin, with a body larger than a pipe buffer, is not a failure (it would be with a pipe under pipefail)
out=$(NOTIFY_CMD='true' run_case "${WORK}" 'ISSUE_URL=u; notify done t "$(head -c 300000 /dev/zero | tr "\0" x)"; echo END'); got=$?
expect "notify (a command that does not read stdin is not a failure)" 0 "END" "${out}" "${got}"
[ "${out}" = "END" ] || ng "notify (command ignoring stdin): expected no output but got \"${out}\"."

# --- notify-slack.sh (the payload, with curl stubbed: the stub saves what would be posted and answers HTTP 200) ---
cat > "${BIN}/curl" <<'EOF'
#!/bin/sh
while [ $# -gt 0 ]; do
  [ "$1" = "--data" ] && printf '%s' "$2" > "${CURL_OUT}"
  shift
done
printf '200'
EOF
chmod +x "${BIN}/curl"
CURL_OUT="${WORK}/curl-out.json"
out=$(printf '%s\n' '**PR #1 の確認**（x）、**AC-1** ok' '**a' 'b** and a ** b' \
  | PATH="${BIN}:${PATH}" CURL_OUT="${CURL_OUT}" SLACK_WEBHOOK_URL=http://example.test \
    AI_FLOW_NOTIFY_KIND=done AI_FLOW_NOTIFY_TITLE=t AI_FLOW_NOTIFY_ISSUE_URL=u ./scripts/notify-slack.sh 2>&1); got=$?
Z=$(printf '\342\200\213')   # U+200B (zero-width space) in UTF-8
expected=$(printf '%s\n' ":white_check_mark: *t*" "*Issue:* u" "" "${Z}*PR #1 の確認*${Z}（x）、${Z}*AC-1*${Z} ok" "*a" "b* and a * b")
actual=$(jq -r .text "${CURL_OUT}" 2>/dev/null)
if [ "${got}" -ne 0 ] || [ "${actual}" != "${expected}" ]; then
  ng "notify-slack.sh (**bold** becomes *bold* with zero-width spaces outside; stray ** collapse to *): differs from what was expected (exit code ${got}).
Expected:
${expected}
Actual:
${actual}
${out}"
else
  pass=$((pass + 1))
fi

# --- notify-google-chat.sh (the same curl stub) ---
out=$(printf '%s\n' '**PR #1 の確認**（x）、**AC-1** ok' \
  | PATH="${BIN}:${PATH}" CURL_OUT="${CURL_OUT}" GOOGLE_CHAT_WEBHOOK_URL=http://example.test \
    AI_FLOW_NOTIFY_KIND=aborted AI_FLOW_NOTIFY_TITLE=t AI_FLOW_NOTIFY_ISSUE_URL=u ./scripts/notify-google-chat.sh 2>&1); got=$?
expected=$(printf '%s\n' "❌ *t*" "*Issue:* u" "" "${Z}*PR #1 の確認*${Z}（x）、${Z}*AC-1*${Z} ok")
actual=$(jq -r .text "${CURL_OUT}" 2>/dev/null)
if [ "${got}" -ne 0 ] || [ "${actual}" != "${expected}" ]; then
  ng "notify-google-chat.sh (Unicode emoji, **bold** becomes *bold*): differs from what was expected (exit code ${got}).
Expected:
${expected}
Actual:
${actual}
${out}"
else
  pass=$((pass + 1))
fi
# A body that is too large is cut so that the whole text stays within 8000 characters and ends with the note
out=$(head -c 30000 /dev/zero | tr '\0' x \
  | PATH="${BIN}:${PATH}" CURL_OUT="${CURL_OUT}" GOOGLE_CHAT_WEBHOOK_URL=http://example.test \
    AI_FLOW_NOTIFY_KIND=done AI_FLOW_NOTIFY_TITLE=t AI_FLOW_NOTIFY_ISSUE_URL=u ./scripts/notify-google-chat.sh 2>&1); got=$?
len=$(jq -r '.text | length' "${CURL_OUT}" 2>/dev/null)
tail_ok=$(jq -r '.text | endswith("read the rest on the Issue)")' "${CURL_OUT}" 2>/dev/null)
if [ "${got}" -ne 0 ] || [ "${len}" != "8000" ] || [ "${tail_ok}" != "true" ]; then
  ng "notify-google-chat.sh (a large body is cut to 8000 characters with the note at the end): exit code ${got}, length ${len}, ends with the note: ${tail_ok}.
${out}"
else
  pass=$((pass + 1))
fi
out=$(printf 'b\n' | env -u GOOGLE_CHAT_WEBHOOK_URL PATH="${BIN}:${PATH}" \
  AI_FLOW_NOTIFY_KIND=done AI_FLOW_NOTIFY_TITLE=t AI_FLOW_NOTIFY_ISSUE_URL=u ./scripts/notify-google-chat.sh 2>&1); got=$?
expect "notify-google-chat.sh (stops without GOOGLE_CHAT_WEBHOOK_URL)" 1 "GOOGLE_CHAT_WEBHOOK_URL environment variable is not set" "${out}" "${got}"

# --- claude-run.sh keeps the notification secrets out of the agent's environment ---
# Run it for real with the claude stub, in a throwaway host repository with the flow at ai-flow/ (flow-paths.sh needs that layout)
AE="${WORK}/agentenv"
mkdir -p "${AE}/ai-flow/scripts" "${AE}/ai-flow/prompts" "${AE}/ai-flow/.claude" "${AE}/.ai-flow"
git -C "${AE}" init -q
for f in claude-run.sh render-prompt.sh merge-permissions.sh flow-paths.sh; do cp -p "scripts/${f}" "${AE}/ai-flow/scripts/"; done
echo 'rules' > "${AE}/ai-flow/prompts/_rules.md"
echo 'prompt' > "${AE}/ai-flow/prompts/p.md"
echo '{"permissions":{"allow":[],"deny":[]}}' > "${AE}/ai-flow/.claude/p-permissions.json"
echo '{}' > "${AE}/.ai-flow/permissions.json"
agent_env() {
  ( cd "${AE}/ai-flow" && env PATH="${BIN}:${PATH}" AI_FLOW_PROJECT_DIR="${AE}/.ai-flow" "$@" \
      ./scripts/claude-run.sh prompts/p.md model 9 .claude/p-permissions.json 2>&1 )
}
out=$(agent_env SLACK_WEBHOOK_URL=s DISCORD_WEBHOOK_URL=d OTHER_SECRET=o KEEP_ME=k NOTIFY_SECRET_VARS='DISCORD_WEBHOOK_URL OTHER_SECRET'); got=$?
expect "claude-run.sh (NOTIFY_SECRET_VARS and SLACK_WEBHOOK_URL are removed, the rest is kept)" 0 "SEEN: KEEP_ME" "${out}" "${got}"
out=$(agent_env SLACK_WEBHOOK_URL=s GOOGLE_CHAT_WEBHOOK_URL=g KEEP_ME=k NOTIFY_SECRET_VARS=); got=$?
expect "claude-run.sh (SLACK_WEBHOOK_URL and GOOGLE_CHAT_WEBHOOK_URL are removed even with NOTIFY_SECRET_VARS empty)" 0 "SEEN: KEEP_ME" "${out}" "${got}"

# --- require_no_mixed_tooling (impl / review stop on tooling commits before anything is charged) ---
# run_step is stubbed to print CHARGED, so a case that gets past the entry checks shows it. The instruction check is the real one (gh stub).
MT="${WORK}/mixed"
git init -q --bare "${MT}/origin.git"
git clone -q "${MT}/origin.git" "${MT}/repo" 2>/dev/null
mtc() { git -C "${MT}/repo" -c user.name=t -c user.email=t@example.com -c commit.gpgsign=false "$@"; }
mkdir -p "${MT}/repo/ai-flow/scripts" "${MT}/repo/src"
echo 'x' > "${MT}/repo/ai-flow/scripts/a.sh"; echo 'x' > "${MT}/repo/src/app.txt"
mtc add -A; mtc commit -q -m init; mtc branch -M main; mtc push -q -u origin main 2>/dev/null
MT_VARS='FAST=f; STRONG=s; REVIEW_JUDGE=j; PLAN_JUDGE=j; PLAN=f; MAX_ROUNDS=1; VERDICT_FILE=v; PR_TITLE_FILE=t; PR_BODY_FILE=b; COMMIT_PROFILE=c; run_step() { echo CHARGED; exit 3; }'
mt_run() {   # mt_run <phase function>: runs it from the flow directory with BASE_BRANCH=main
  GH_MODE=issue_tag run_case "${MT}/repo/ai-flow" "BASE_BRANCH=main; ${MT_VARS}; $1"
}
mt_stopped() {   # mt_stopped <name> <phase function> <needle>: stopped by fail, before run_step
  out=$(mt_run "$2"); got=$?
  expect "$1" 1 "$3" "${out}" "${got}"
  case "${out}" in *CHARGED*) ng "$1: run_step ran before the check stopped it. Output: ${out}" ;; esac
}
mt_charged() {   # mt_charged <name> <phase function>: got past the entry checks
  out=$(mt_run "$2"); got=$?
  expect "$1" 3 "CHARGED" "${out}" "${got}"
}

mt_charged "require_no_mixed_tooling (nothing ahead of origin: impl goes on)" phase_impl
echo 'y' >> "${MT}/repo/src/app.txt"; mtc commit -q -am "project change"
mt_charged "require_no_mixed_tooling (project commits ahead of origin, as when review is resumed)" phase_review
echo 'y' >> "${MT}/repo/ai-flow/scripts/a.sh"; mtc commit -q -am "tooling update, not pushed"
mt_stopped "require_no_mixed_tooling (a tooling commit on the local main stops impl before it is charged)" phase_impl \
  "FAIL:Tooling files are in commits that are not on origin/"
mt_stopped "require_no_mixed_tooling (the message names the file)" phase_impl "ai-flow/scripts/a.sh"
mtc switch -q -c feature/9-x; echo 'z' >> "${MT}/repo/src/app.txt"; mtc commit -q -am "agent commit"
mt_stopped "require_no_mixed_tooling (a project branch cut from it stops review before it is charged)" phase_review \
  "FAIL:Tooling files are in commits that are not on origin/"
out=$(GH_MODE=issue_notag run_case "${MT}/repo/ai-flow" "BASE_BRANCH=main; ${MT_VARS}; phase_impl"); got=$?
expect "require_no_mixed_tooling (checked before the instruction document, so any Issue number can try it)" 1 "FAIL:Tooling files" "${out}" "${got}"

# Once the tooling commit is on origin, the branch carries only project commits
mtc push -q origin "main" 2>/dev/null; mtc fetch -q
mt_charged "require_no_mixed_tooling (after pushing the tooling commit and fetching)" phase_review
# Tooling updates that landed on origin after the fork are not the branch's (two dots showed them reversed)
mtc switch -q main; echo 'w' >> "${MT}/repo/ai-flow/scripts/a.sh"; mtc commit -q -am "tooling update 2"; mtc push -q origin main 2>/dev/null
mtc switch -q feature/9-x
out=$(run_case "${MT}/repo/ai-flow" 'BASE_BRANCH=main; mixed_tooling HEAD; echo END'); got=$?
expect "mixed_tooling (tooling updates on origin after the fork are not counted)" 0 "END" "${out}" "${got}"
[ "${out}" = "END" ] || ng "mixed_tooling (origin moved on after the fork): expected nothing but got \"${out}\"."
mt_charged "require_no_mixed_tooling (a branch behind origin's tooling updates goes on)" phase_review

mt_stopped "require_base (a wrong BASE_BRANCH stops impl before it is charged)" "BASE_BRANCH=nope; phase_impl" \
  "nope not found. Check that BASE_BRANCH"

# --- Swappable models (PLAN_JUDGE_MODEL / REVIEW_JUDGE_MODEL / PLAN_MODEL) ---
out=$(run_case "${WORK}" 'STRONG=S; FAST=F; echo "[$(model_id "")|$(model_id strong)|$(model_id fast)|$(model_id raw-id)]"'); got=$?
expect "model_id (empty = strong / strong / fast / a raw model ID)" 0 "[S|S|F|raw-id]" "${out}" "${got}"
out=$(GH_MODE=issue_tag run_case "${MT}/repo/ai-flow" "BASE_BRANCH=main; ${MT_VARS}; PLAN_JUDGE=pj; REVIEW_JUDGE=rj
  run_step() { case \"\$2\" in prompts/plan-judge.md) echo \"PLAN_JUDGE_RAN_WITH=\$3\"; exit 3 ;; esac; }; phase_impl"); got=$?
expect "phase_impl (plan-judge runs with PLAN_JUDGE, not REVIEW_JUDGE)" 3 "PLAN_JUDGE_RAN_WITH=pj" "${out}" "${got}"
# plan and plan-revise run with PLAN, implement with FAST: the first verdict sends the plan back, the second approves it
out=$(GH_MODE=issue_tag run_case "${MT}/repo/ai-flow" "BASE_BRANCH=main; ${MT_VARS}; PLAN=pm; PLAN_JUDGE=pj; MAX_ROUNDS=2
  VERDICT_FILE='${WORK}/plan-verdict'; rm -f '${WORK}/plan-sent-back'
  run_step() {
    printf '%s ' \"\${2#prompts/}=\$3\"
    case \"\$2\" in
      prompts/plan-judge.md)
        if [ -f '${WORK}/plan-sent-back' ]; then echo APPROVED > \"\$VERDICT_FILE\"
        else touch '${WORK}/plan-sent-back'; echo CHANGES_REQUESTED > \"\$VERDICT_FILE\"; fi ;;
      prompts/implement.md) exit 3 ;;
    esac
  }; phase_impl"); got=$?
expect "phase_impl (plan and plan-revise run with PLAN, implement with FAST)" 3 \
  "plan.md=pm plan-judge.md=pj plan-revise.md=pm plan-judge.md=pj implement.md=f" "${out}" "${got}"
# The Makefile's defaults: unset, PLAN_JUDGE_MODEL follows REVIEW_JUDGE_MODEL, also when that is given on the command line,
# and PLAN_MODEL is the fast model whatever the judges are set to.
# Run in an empty directory with a missing project directory, so the host's .env / .ai-flow/config.mk (which may set them) do not count
MKF="$(pwd)/Makefile"
mkdir -p "${WORK}/mkjudge"
printf 'show:\n\t@echo "R=$(REVIEW_JUDGE_MODEL) P=$(PLAN_JUDGE_MODEL) W=$(PLAN_MODEL)"\n' > "${WORK}/mkjudge/show.mk"
mk_judges() {
  ( cd "${WORK}/mkjudge" && env -u REVIEW_JUDGE_MODEL -u PLAN_JUDGE_MODEL -u PLAN_MODEL make -s --no-print-directory -f "${MKF}" -f show.mk show \
      AI_FLOW_PROJECT_DIR="${WORK}/mkjudge/none" STRONG_MODEL=S FAST_MODEL=F "$@" 2>/dev/null | tail -n 1 )
}
out=$(mk_judges); got=$?
expect "Makefile (all unset: the fast model for all)" 0 "R=F P=F W=F" "${out}" "${got}"
out=$(mk_judges REVIEW_JUDGE_MODEL=strong); got=$?
expect "Makefile (PLAN_JUDGE_MODEL follows REVIEW_JUDGE_MODEL from the command line; PLAN_MODEL does not)" 0 "R=strong P=strong W=F" "${out}" "${got}"
out=$(mk_judges REVIEW_JUDGE_MODEL=fast PLAN_JUDGE_MODEL=strong); got=$?
expect "Makefile (PLAN_JUDGE_MODEL set on its own)" 0 "R=fast P=strong W=F" "${out}" "${got}"
out=$(mk_judges PLAN_MODEL=strong); got=$?
expect "Makefile (PLAN_MODEL set on its own moves neither judge)" 0 "R=F P=F W=strong" "${out}" "${got}"

# --- examples/go/.ai-flow wrappers (multi-module Go: TEST_CMD / FORMAT_CHECK_CMD / FORMAT_FILE_CMD) ---
# Run from the flow directory of a throwaway repository with two modules and no go.work, as the agents would.
GOW="$(pwd)/examples/go/.ai-flow"
if ! command -v go >/dev/null 2>&1 || ! command -v gofmt >/dev/null 2>&1; then
  echo "selftest: note: go is not available; skipping the examples/go wrapper tests." >&2
elif [ -d "${GOW}" ]; then
  GR="${WORK}/gomods"
  mkdir -p "${GR}/ai-flow" "${GR}/alpha" "${GR}/beta"
  git -C "${GR}" init -q
  printf 'module example.com/alpha\n\ngo 1.21\n' > "${GR}/alpha/go.mod"
  printf 'package alpha\n\nfunc One() int { return 1 }\n' > "${GR}/alpha/a.go"
  printf 'package alpha\n\nimport "testing"\n\nfunc TestOne(t *testing.T) {\n\tif One() != 1 {\n\t\tt.Fatal("x")\n\t}\n}\n' > "${GR}/alpha/a_test.go"
  printf 'module example.com/beta\n\ngo 1.21\n' > "${GR}/beta/go.mod"
  printf 'package beta\n\nfunc Two() int { return 2 }\n' > "${GR}/beta/b.go"
  gor() { ( cd "${GR}/ai-flow" && GOCACHE="${WORK}/gocache" "$@" 2>&1 ); }

  out=$(gor "${GOW}/go-test.sh"); got=$?
  expect "go-test.sh (every module passes, run from the flow directory; new go.mod files count)" 0 "--- go test beta" "${out}" "${got}"
  printf 'package beta\n\nimport "testing"\n\nfunc TestTwo(t *testing.T) { t.Fatal("broken") }\n' > "${GR}/beta/b_test.go"
  out=$(gor "${GOW}/go-test.sh"); got=$?
  expect "go-test.sh (fails when one module fails, and names it)" 1 "failed in: beta" "${out}" "${got}"
  out=$(gor "${GOW}/go-test.sh" alpha); got=$?
  expect "go-test.sh (only the modules given)" 0 "--- go test alpha" "${out}" "${got}"
  out=$(gor "${GOW}/go-test.sh" nope); got=$?
  expect "go-test.sh (a directory without go.mod fails)" 1 "nope/go.mod not found" "${out}" "${got}"

  out=$(gor "${GOW}/gofmt-check.sh"); got=$?
  expect "gofmt-check.sh (all formatted)" 0 "" "${out}" "${got}"
  printf 'package beta\nfunc   Three() int { return 3 }\n' > "${GR}/beta/c.go"
  out=$(gor "${GOW}/gofmt-check.sh"); got=$?
  expect "gofmt-check.sh (lists the unformatted file and exits 1)" 1 "beta/c.go" "${out}" "${got}"

  out=$(gor "${GOW}/gofmt-file.sh" "${GR}/alpha/a.go"); got=$?
  expect "gofmt-file.sh (formatted)" 0 "" "${out}" "${got}"
  out=$(gor "${GOW}/gofmt-file.sh" "${GR}/beta/c.go"); got=$?
  expect "gofmt-file.sh (unformatted)" 1 "" "${out}" "${got}"
  printf 'package beta\nfunc {\n' > "${GR}/beta/d.go"
  out=$(gor "${GOW}/gofmt-file.sh" "${GR}/beta/d.go"); got=$?
  expect "gofmt-file.sh (a syntax error is not taken as formatted)" 2 "" "${out}" "${got}"
fi

# --- resign-subtree-merge.sh (sign what git subtree --squash creates, without changing content) ---
# Offline: the upstream is a local throwaway repository and signing uses a throwaway SSH key, so neither the network
# nor the user's own signing setup (e.g. a 1Password agent) is involved.
RESIGN="$(pwd)/scripts/resign-subtree-merge.sh"
git subtree -h >/dev/null 2>&1; subtree_rc=$?   # prints usage and exits 129 when available
if [ "${subtree_rc}" -ne 0 ] && [ "${subtree_rc}" -ne 129 ]; then
  echo "selftest: note: git subtree is not available; skipping the resign-subtree-merge.sh tests." >&2
elif ! command -v ssh-keygen >/dev/null 2>&1; then
  echo "selftest: note: ssh-keygen is not available; skipping the resign-subtree-merge.sh tests." >&2
else
  RS="${WORK}/resign"
  mkdir -p "${RS}/up" "${RS}/host"
  ssh-keygen -q -t ed25519 -N '' -f "${RS}/key"
  printf 't@example.com %s\n' "$(cat "${RS}/key.pub")" > "${RS}/allowed"
  upc() { git -C "${RS}/up" -c user.name=u -c user.email=u@example.com -c commit.gpgsign=false "$@"; }
  git -C "${RS}/up" init -q
  echo 'one' > "${RS}/up/a.txt"; mkdir -p "${RS}/up/dir"; echo 'b' > "${RS}/up/dir/b.txt"
  upc add -A; upc commit -q -m "upstream 1"; upc tag t1
  echo 'two' >> "${RS}/up/a.txt"; upc commit -q -am "upstream 2"; upc tag t2
  H="${RS}/host"
  git -C "${H}" init -q
  git -C "${H}" config user.name t; git -C "${H}" config user.email t@example.com
  git -C "${H}" config gpg.format ssh; git -C "${H}" config user.signingkey "${RS}/key"
  git -C "${H}" config gpg.ssh.program ssh-keygen; git -C "${H}" config gpg.ssh.allowedSignersFile "${RS}/allowed"
  git -C "${H}" config commit.gpgsign true
  echo 'host' > "${H}/README"; git -C "${H}" add -A; git -C "${H}" commit -q -m init
  sig() { git -C "${H}" log -1 --format=%G? "$1"; }
  both_signed() { [ "$(sig HEAD)" = "G" ] && [ "$(sig HEAD^2)" = "G" ]; }
  tree_is() { [ "$(git -C "${H}" rev-parse HEAD:ext)" = "$(git -C "${RS}/up" rev-parse "$1^{tree}")" ]; }

  # The documented steps (docs/setup.md §3): fetch the tag, then pass its commit to git subtree add / merge.
  tag_commit() { git -C "${H}" fetch -q "${RS}/up" "refs/tags/$1" && git -C "${H}" rev-parse 'FETCH_HEAD^{commit}'; }
  c=$(tag_commit t1)
  (cd "${H}" && git subtree add -q --prefix=ext "${c}" --squash) >/dev/null 2>&1
  git -C "${H}" diff --quiet "${c}" HEAD:ext || ng "resign-subtree-merge (precondition): subtree add of a commit did not put t1 under ext/."
  [ "$(sig HEAD^2)" = "N" ] || ng "resign-subtree-merge (precondition): git subtree add was expected to leave the squash commit unsigned."
  out=$(cd "${H}" && "${RESIGN}" 2>&1); got=$?
  if [ "${got}" -eq 0 ] && both_signed && tree_is t1; then pass=$((pass + 1)); else
    ng "resign-subtree-merge (after add): expected both commits signed and ext/ = t1 (exit ${got}). Output: ${out}"; fi
  before=$(git -C "${H}" rev-parse HEAD)
  out=$(cd "${H}" && "${RESIGN}" 2>&1); got=$?
  expect "resign-subtree-merge (already signed: nothing to do)" 0 "already signed" "${out}" "${got}"
  [ "$(git -C "${H}" rev-parse HEAD)" = "${before}" ] || ng "resign-subtree-merge (already signed): HEAD changed."

  c=$(tag_commit t2)
  (cd "${H}" && git subtree merge -q --prefix=ext "${c}" --squash -m "merge t2") >/dev/null 2>&1
  out=$(cd "${H}" && "${RESIGN}" 2>&1); got=$?
  if [ "${got}" -eq 0 ] && both_signed && tree_is t2; then pass=$((pass + 1)); else
    ng "resign-subtree-merge (after merge): expected both commits signed and ext/ = t2 (exit ${got}). Output: ${out}"; fi
  git -C "${H}" log -1 --format=%B HEAD^2 | grep -q "^git-subtree-split: ${c}\$" \
    || ng "resign-subtree-merge (after merge): the squash commit does not record git-subtree-split: t2."

  echo 'three' >> "${RS}/up/a.txt"; upc commit -q -am "upstream 3"; upc tag t3
  (cd "${H}" && git subtree pull -q --prefix=ext "${RS}/up" t3 --squash -m "pull t3") >/dev/null 2>&1
  out=$(cd "${H}" && "${RESIGN}" 2>&1); got=$?
  if [ "${got}" -eq 0 ] && both_signed && tree_is t3; then pass=$((pass + 1)); else
    ng "resign-subtree-merge (after pull, the older way to update): expected both commits signed and ext/ = t3 (exit ${got}). Output: ${out}"; fi
  out=$(cd "${H}" && git subtree pull --prefix=ext "${RS}/up" t3 --squash 2>&1); got=$?
  expect "resign-subtree-merge (the next subtree pull still finds the previous position)" 0 "already at commit" "${out}" "${got}"
  [ -z "$(git -C "${H}" log --format='%h %G?' | grep -v ' G$')" ] || ng "resign-subtree-merge: unsigned commits remain in the host history."

  git -C "${H}" commit -q --allow-empty -m plain
  out=$(cd "${H}" && "${RESIGN}" 2>&1); got=$?
  expect "resign-subtree-merge (refuses a HEAD that is not a merge)" 1 "HEAD is not a merge commit" "${out}" "${got}"
fi

if [ "${status}" -eq 0 ]; then
  echo "selftest: all ${pass} regression tests for run-phase.sh / render-prompt.sh / claude-run.sh / notify-slack.sh / notify-google-chat.sh / resign-subtree-merge.sh passed."
fi
exit "${status}"
