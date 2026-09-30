#!/bin/bash
# run-phase.sh の関数の回帰テスト。check-scripts.sh の最後から呼ぶ（make check で毎回走る）。
# 使い方: ./scripts/selftest.sh（ai-flow/ で実行）
#
# ここで見るのは「動かして初めて分かる」種類の基盤のバグ。実際に踏んだものを1件ずつ固定している。
#   - TOOLING_PATHS / unformatted_files がルート相対のパスを ai-flow/ から見て取り違える（#10 で発覚）
#   - require_instruction / ensure_pr_url が gh の失敗を別の意味のエラーに化けさせる（#9、#10）
#   - 判定役の NEEDS_HUMAN が周回を待たずに止まる
#
# run-phase.sh は読み込むと本体が走るので、テスト対象の関数と TOOLING_PATHS の定義だけを sed で抜き出して
# 読み込む。関数の書き方（name() { … } の } が行頭）が変わって抜き出せなくなったら、黙って通さずに落とす。
# gh と npx は PATH の先頭に置いたスタブで差し替えるので、ネットワークにも課金にも触れない。
set -uo pipefail

SRC="$(pwd)/scripts/run-phase.sh"
[ -f "${SRC}" ] || { echo "NG: ${SRC} がありません。ai-flow/ で実行してください。" >&2; exit 1; }

status=0
pass=0
ng() { echo "NG: $1" >&2; status=1; }

WORK=$(mktemp -d) || { echo "NG: 一時ディレクトリを作れませんでした。" >&2; exit 1; }
trap 'rm -rf "${WORK}"' EXIT

# --- テスト対象の抜き出し ---------------------------------------------------------------
LIB="${WORK}/lib.sh"
grep '^TOOLING_PATHS=' "${SRC}" > "${LIB}"
[ -s "${LIB}" ] || ng "run-phase.sh から TOOLING_PATHS の定義を抜き出せませんでした。"
FUNCS="worktree_paths tooling_state format_target format_ok unformatted_files require_instruction ensure_pr_url handle_verdict"
for fn in ${FUNCS}; do
  body=$(sed -n "/^${fn}() {/,/^}/p" "${SRC}")
  if [ -z "${body}" ]; then
    ng "run-phase.sh から関数 ${fn} を抜き出せませんでした（定義の形が変わった可能性）。"
    continue
  fi
  printf '%s\n' "${body}" >> "${LIB}"
done
[ "${status}" -eq 0 ] || exit 1

# --- スタブ ------------------------------------------------------------------------------
BIN="${WORK}/bin"
mkdir -p "${BIN}"

# gh: GH_MODE で振る舞いを切り替える
cat > "${BIN}/gh" <<'EOF'
#!/bin/sh
case "${GH_MODE:-}" in
  issue_tag)   printf 'author:\tx\n--\n<!-- AI-TAG: INSTRUCTION -->\n\n# 指示書\n' ;;
  issue_notag) printf 'author:\tx\n--\n本文で <!-- AI-TAG: INSTRUCTION --> に言及しているだけ\n' ;;
  fail)        echo "HTTP 401: Bad credentials (https://api.github.com/graphql)" >&2; exit 1 ;;
  pr_nopr)     echo 'no pull requests found for branch "master"' >&2; exit 1 ;;
  pr_warn)     echo "A new release of gh is available" >&2; echo "https://github.com/o/r/pull/9" ;;
  *)           echo "gh stub: GH_MODE が未設定" >&2; exit 99 ;;
esac
EOF

# npx prettier --check <file>: ファイルが無いか、中身に UNFORMATTED を含めば失敗
cat > "${BIN}/npx" <<'EOF'
#!/bin/sh
f=""
for a in "$@"; do f="$a"; done
[ -f "$f" ] || exit 2
grep -q UNFORMATTED "$f" && exit 1
exit 0
EOF
chmod +x "${BIN}/gh" "${BIN}/npx"

# 1ケースを別プロセスで走らせ、出力（標準出力+標準エラー）と終了コードを返す。
# fail / halt は run-phase.sh 本体の定義ではなく、判別できる印を出して終わるスタブにする。
run_case() {
  local dir="$1" body="$2"
  ( cd "${dir}" && PATH="${BIN}:${PATH}" /bin/bash -c "
      set -uo pipefail
      PHASE=selftest; ISSUE=9; RESULT=''; PR_URL=\"\${PR_URL:-}\"
      fail() { echo \"FAIL:\$1\"; exit 1; }
      halt() { echo \"HALT:\$1\"; exit 0; }
      source '${LIB}'
      ${body}
    " 2>&1 )
}

# 期待: 出力に needle を含み、終了コードが code
expect() {
  local name="$1" code="$2" needle="$3" out="$4" got="$5"
  if [ "${got}" != "${code}" ]; then
    ng "${name}: 終了コード ${got}（期待 ${code}）。出力: ${out}"
  elif [ -n "${needle}" ] && ! printf '%s' "${out}" | grep -qF -- "${needle}"; then
    ng "${name}: 出力に「${needle}」がありません。出力: ${out}"
  else
    pass=$((pass + 1))
  fi
}

# --- 使い捨てリポジトリ（ai-flow/ サブディレクトリあり。本番と同じく ai-flow/ から実行する） ---
REPO="${WORK}/repo"
mkdir -p "${REPO}/ai-flow/scripts" "${REPO}/ai-flow/docs" "${REPO}/docs" "${REPO}/test" "${REPO}/web"
git -C "${REPO}" init -q
echo 'x' > "${REPO}/ai-flow/scripts/a.sh"
echo 'x' > "${REPO}/ai-flow/docs/g.md"
echo 'x' > "${REPO}/docs/pp.md"
echo 'x' > "${REPO}/docs/日本語 ファイル.md"
echo 'x' > "${REPO}/README.md"
echo 'x' > "${REPO}/.gitignore"
echo 'const a = 1;' > "${REPO}/test/x.js"
git -C "${REPO}" add -A
git -C "${REPO}" -c user.name=t -c user.email=t@example.com commit -q -m init

# 案件のファイルと基盤ファイルを混ぜて変更する
echo 'y' >> "${REPO}/docs/pp.md"
echo 'y' >> "${REPO}/docs/日本語 ファイル.md"
echo 'y' >> "${REPO}/README.md"
echo 'y' >> "${REPO}/ai-flow/scripts/a.sh"
echo 'y' >> "${REPO}/.gitignore"
echo 'new' > "${REPO}/ai-flow/docs/new.md"
git -C "${REPO}" mv ai-flow/docs/g.md docs/g.md          # 基盤から出す移動も基盤の改変
echo 'UNFORMATTED' >> "${REPO}/test/x.js"                # 既存ファイルを未整形に
echo 'UNFORMATTED' > "${REPO}/web/a b.js"                # スペースを含む新規の未整形ファイル
echo 'const ok = 1;' > "${REPO}/web/ok.js"               # 整形済みの新規ファイル
echo 'UNFORMATTED' > "${REPO}/ai-flow/docs/note.md"      # 整形対象外の拡張子

# --- tooling_state ---
out=$(run_case "${REPO}/ai-flow" 'tooling_state'); got=$?
expected=$(printf '%s\n' .gitignore ai-flow/docs/g.md ai-flow/docs/new.md ai-flow/docs/note.md ai-flow/scripts/a.sh)
if [ "${got}" -ne 0 ] || [ "${out}" != "${expected}" ]; then
  ng "tooling_state: 基盤ファイルの判定が期待と違います（ai-flow/ から実行）。
期待:
${expected}
実際:
${out}"
else
  pass=$((pass + 1))
fi

# --- unformatted_files ---
out=$(run_case "${REPO}/ai-flow" 'unformatted_files'); got=$?
expected=$(printf '%s\n' test/x.js 'web/a b.js')
if [ "${got}" -ne 0 ] || [ "$(printf '%s' "${out}" | sort)" != "${expected}" ]; then
  ng "unformatted_files: 未整形の検出が期待と違います（ai-flow/ から実行。ルート相対のパスを見られているか）。
期待:
${expected}
実際:
${out}"
else
  pass=$((pass + 1))
fi

# --- require_instruction ---
out=$(GH_MODE=issue_tag run_case "${WORK}" 'require_instruction && echo PASSED'); got=$?
expect "require_instruction（タグあり）" 0 "PASSED" "${out}" "${got}"
out=$(GH_MODE=issue_notag run_case "${WORK}" 'require_instruction && echo PASSED'); got=$?
expect "require_instruction（行頭のタグなし）" 1 "FAIL:Issue #9 に指示書がありません" "${out}" "${got}"
out=$(GH_MODE=fail run_case "${WORK}" 'require_instruction && echo PASSED'); got=$?
expect "require_instruction（gh 失敗）" 1 "HTTP 401: Bad credentials" "${out}" "${got}"
expect "require_instruction（gh 失敗は指示書なしと区別）" 1 "を gh で取得できませんでした" "${out}" "${got}"

# --- ensure_pr_url ---
out=$(PR_URL=https://example.com/pull/1 GH_MODE=fail run_case "${REPO}" 'ensure_pr_url && echo "URL=${PR_URL}"'); got=$?
expect "ensure_pr_url（指定済みなら gh を呼ばない）" 0 "URL=https://example.com/pull/1" "${out}" "${got}"
out=$(GH_MODE=pr_nopr run_case "${REPO}" 'ensure_pr_url && echo "URL=${PR_URL}"'); got=$?
expect "ensure_pr_url（gh 失敗）" 1 'no pull requests found for branch "master"' "${out}" "${got}"
expect "ensure_pr_url（ブランチ名を出す）" 1 "現在のブランチ:" "${out}" "${got}"
out=$(GH_MODE=pr_warn run_case "${REPO}" 'ensure_pr_url && echo "URL=[${PR_URL}]"'); got=$?
expect "ensure_pr_url（成功時の警告が URL に混ざらない）" 0 "URL=[https://github.com/o/r/pull/9]" "${out}" "${got}"

# --- handle_verdict ---
out=$(run_case "${WORK}" 'handle_verdict APPROVED 実装 "make review" && echo BREAK'); got=$?
expect "handle_verdict（APPROVED で抜ける）" 0 "BREAK" "${out}" "${got}"
out=$(run_case "${WORK}" 'handle_verdict CHANGES_REQUESTED 実装 "make review" || echo NEXT_ROUND'); got=$?
expect "handle_verdict（CHANGES_REQUESTED で次の周）" 0 "NEXT_ROUND" "${out}" "${got}"
out=$(run_case "${WORK}" 'handle_verdict NEEDS_HUMAN 実装 "make review"; echo NOT_REACHED'); got=$?
expect "handle_verdict（NEEDS_HUMAN で即 halt）" 0 "HALT:実装の判定が人の判断を求めています" "${out}" "${got}"
if printf '%s' "${out}" | grep -qF NOT_REACHED; then ng "handle_verdict（NEEDS_HUMAN）: halt の後も処理が続きました。"; fi
out=$(run_case "${WORK}" 'handle_verdict "" 実装 "make review"; echo NOT_REACHED'); got=$?
expect "handle_verdict（空の判定は fail）" 1 "FAIL:判定ファイルの内容が想定外です" "${out}" "${got}"

if [ "${status}" -eq 0 ]; then
  echo "selftest: run-phase.sh の回帰テスト ${pass} 件すべて通過しました。"
fi
exit "${status}"
