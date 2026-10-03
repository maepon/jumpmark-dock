#!/bin/bash
# run-phase.sh の関数の回帰テスト。check-scripts.sh の最後から呼ぶ（make check で毎回走る）。
# 使い方: ./scripts/selftest.sh（フローのディレクトリで実行）
#
# ここで見るのは「動かして初めて分かる」種類の基盤のバグ。実際に踏んだものを1件ずつ固定している。
#   - TOOLING_PATHS / unformatted_files がルート相対のパスをフローのディレクトリから見て取り違える（#10 で発覚）
#   - フローのディレクトリ名・深さに依存する（名前を変えると基盤ファイルの改変が素通りする）
#   - require_instruction / ensure_pr_url が gh の失敗を別の意味のエラーに化けさせる（#9、#10）
#   - 判定役の NEEDS_HUMAN が周回を待たずに止まる
#   - 案件設定（.ai-flow/config.mk）の整形コマンド・対象パターンの扱い、render-prompt.sh のプレースホルダの埋め方
#
# run-phase.sh は読み込むと本体が走るので、テスト対象の関数と TOOLING_PATHS の定義だけを sed で抜き出して
# 読み込む。関数の書き方（name() { … } の } が行頭）が変わって抜き出せなくなったら、黙って通さずに落とす。
# gh と npx は PATH の先頭に置いたスタブで差し替えるので、ネットワークにも課金にも触れない。
set -uo pipefail

# 整形チェックの設定は jumpmark-dock と同じ形にしておく（npx はスタブ）。案件設定の値には依存させない
export FORMAT_FILE_CMD="npx prettier --check"
export FORMAT_GLOBS="*.js *.css *.html"

SRC="$(pwd)/scripts/run-phase.sh"
FLOW_PATHS="$(pwd)/scripts/flow-paths.sh"
[ -f "${SRC}" ] || { echo "NG: ${SRC} がありません。フローのディレクトリで実行してください。" >&2; exit 1; }

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
      . '${FLOW_PATHS}'
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

# --- 使い捨てリポジトリ（本番と同じくフローのディレクトリから実行する） ---
# フローのディレクトリ名に依存したバグ（TOOLING_PATHS の直書きなど）を見逃さないように、名前と深さを変えて2回回す。
#   ai-flow        このリポジトリと同じ
#   tools/ai.flow  深さ2で、名前に正規表現の特殊文字（.）を含む。エスケープし忘れると tools/aiXflow/ も基盤扱いになる
repo_suite() {
  local F="$1" REPO="${WORK}/repo-$2" decoy=""
  mkdir -p "${REPO}/${F}/scripts" "${REPO}/${F}/docs" "${REPO}/docs" "${REPO}/test" "${REPO}/web" "${REPO}/.ai-flow"
  git -C "${REPO}" init -q
  echo 'x' > "${REPO}/${F}/scripts/a.sh"
  echo 'x' > "${REPO}/${F}/docs/g.md"
  printf 'tmp/\n.env\n' > "${REPO}/${F}/.gitignore"          # 実物のフローの .gitignore と同じく tmp/ と .env を無視する
  echo 'x' > "${REPO}/${F}/README.md"
  echo 'x' > "${REPO}/docs/pp.md"
  echo 'x' > "${REPO}/docs/日本語 ファイル.md"
  echo 'x' > "${REPO}/README.md"
  echo 'x' > "${REPO}/.gitignore"
  echo 'x' > "${REPO}/.ai-flow/permissions.json"
  echo 'const a = 1;' > "${REPO}/test/x.js"
  case "${F}" in *.*) decoy=$(printf '%s' "${F}" | tr '.' 'X'); mkdir -p "${REPO}/${decoy}/scripts"; echo 'x' > "${REPO}/${decoy}/scripts/a.sh" ;; esac
  git -C "${REPO}" add -A
  git -C "${REPO}" -c user.name=t -c user.email=t@example.com commit -q -m init

  # 案件のファイルと基盤ファイルを混ぜて変更する
  echo 'y' >> "${REPO}/docs/pp.md"
  echo 'y' >> "${REPO}/docs/日本語 ファイル.md"
  echo 'y' >> "${REPO}/README.md"
  echo 'y' >> "${REPO}/${F}/scripts/a.sh"
  echo 'y' >> "${REPO}/${F}/.gitignore"                     # フローの .gitignore も基盤
  echo 'y' >> "${REPO}/.gitignore"                          # ルートの .gitignore も保護を続ける
  echo 'y' >> "${REPO}/.ai-flow/permissions.json"           # 案件設定（権限の追加分）も基盤
  echo 'new' > "${REPO}/${F}/docs/new.md"
  echo 'y' >> "${REPO}/${F}/README.md"                      # フローのディレクトリの中は丸ごと基盤
  mkdir -p "${REPO}/${F}/examples/project"
  echo 'new' > "${REPO}/${F}/examples/project/x.md"
  mkdir -p "${REPO}/${F}/tmp" && echo 'w' > "${REPO}/${F}/tmp/work.md"   # 作業ファイルはフローの .gitignore で無視される
  git -C "${REPO}" mv "${F}/docs/g.md" docs/g.md            # 基盤から出す移動も基盤の改変
  echo 'UNFORMATTED' >> "${REPO}/test/x.js"                # 既存ファイルを未整形に
  echo 'UNFORMATTED' > "${REPO}/web/a b.js"                # スペースを含む新規の未整形ファイル
  echo 'const ok = 1;' > "${REPO}/web/ok.js"               # 整形済みの新規ファイル
  echo 'UNFORMATTED' > "${REPO}/${F}/docs/note.md"         # 整形対象外の拡張子
  [ -z "${decoy}" ] || echo 'y' >> "${REPO}/${decoy}/scripts/a.sh"   # 名前が似ているだけの案件のファイル

  # --- flow-paths.sh ---
  local depth_rel
  depth_rel=$(printf '%s/' "${F}" | sed -e 's,[^/][^/]*/,../,g')
  out=$(run_case "${REPO}/${F}" 'printf "%s|%s|%s|%s" "${FLOW_PREFIX}" "${FLOW_DIR}" "${ROOT_REL}" "${flow_paths_error}"'); got=$?
  expect "flow-paths（${F}）" 0 "${F}/|${F}|${depth_rel}|" "${out}" "${got}"

  # --- tooling_state ---
  out=$(run_case "${REPO}/${F}" 'tooling_state'); got=$?
  expected=$(printf '%s\n' .ai-flow/permissions.json .gitignore "${F}/.gitignore" "${F}/README.md" "${F}/docs/g.md" "${F}/docs/new.md" "${F}/docs/note.md" "${F}/examples/project/x.md" "${F}/scripts/a.sh" | LC_ALL=C sort)
  if [ "${got}" -ne 0 ] || [ "$(printf '%s\n' "${out}" | LC_ALL=C sort)" != "${expected}" ]; then
    ng "tooling_state: 基盤ファイルの判定が期待と違います（${F}/ から実行）。
期待:
${expected}
実際:
${out}"
  else
    pass=$((pass + 1))
  fi

  # --- unformatted_files ---
  out=$(run_case "${REPO}/${F}" 'unformatted_files'); got=$?
  expected=$(printf '%s\n' test/x.js 'web/a b.js')
  if [ "${got}" -ne 0 ] || [ "$(printf '%s' "${out}" | sort)" != "${expected}" ]; then
    ng "unformatted_files: 未整形の検出が期待と違います（${F}/ から実行。ルート相対のパスを見られているか）。
期待:
${expected}
実際:
${out}"
  else
    pass=$((pass + 1))
  fi

  # --- 整形チェックの設定 ---
  out=$(FORMAT_FILE_CMD='' run_case "${REPO}/${F}" 'unformatted_files; echo END'); got=$?
  expect "unformatted_files（FORMAT_FILE_CMD が空なら整形チェックをしない）" 0 "END" "${out}" "${got}"
  [ "${out}" = "END" ] || ng "unformatted_files（FORMAT_FILE_CMD が空）: 何も出ないはずが「${out}」が出ました。"
  out=$(FORMAT_FILE_CMD='false' run_case "${REPO}/${F}" 'unformatted_files'); got=$?
  expected=$(printf '%s\n' test/x.js 'web/a b.js' web/ok.js)
  if [ "${got}" -ne 0 ] || [ "$(printf '%s' "${out}" | sort)" != "${expected}" ]; then
    ng "unformatted_files（チェック自体が失敗するなら未整形扱いで止める）: 期待と違います。
期待:
${expected}
実際:
${out}"
  else
    pass=$((pass + 1))
  fi
}
repo_suite ai-flow 1
repo_suite tools/ai.flow 2
REPO="${WORK}/repo-1"   # 以降の ensure_pr_url は git リポジトリの中で走らせる

# --- flow-paths.sh（ルートに置かれたら止める） ---
mkdir -p "${WORK}/rootflow"
git -C "${WORK}/rootflow" init -q
out=$(run_case "${WORK}/rootflow" 'echo "ERR=${flow_paths_error}"'); got=$?
expect "flow-paths（ルートに置かれたら理由を返す）" 0 "ERR=フローがリポジトリのルートに置かれています" "${out}" "${got}"
# カレントに *.js に当たるファイルがあっても、パターンがそのファイル名に化けない
echo 'x' > "${WORK}/here.js"
out=$(run_case "${WORK}" 'format_target web/y.js && echo TARGET'); got=$?
expect "format_target（パターンがカレントのファイル名に展開されない）" 0 "TARGET" "${out}" "${got}"
out=$(run_case "${WORK}" 'format_target docs/y.md || echo NOT_TARGET'); got=$?
expect "format_target（対象外の拡張子）" 0 "NOT_TARGET" "${out}" "${got}"
out=$(FORMAT_GLOBS='' run_case "${WORK}" 'format_target web/y.js || echo NOT_TARGET'); got=$?
expect "format_target（FORMAT_GLOBS が空なら対象なし）" 0 "NOT_TARGET" "${out}" "${got}"

# --- render-prompt.sh ---
RENDER="$(pwd)/scripts/render-prompt.sh"
PROJ="${WORK}/proj"
mkdir -p "${PROJ}"
printf '## 前提\nテストは `{{TEST_CMD}}`\n' > "${PROJ}/context.md"
printf '%s\n' '- 項目1' > "${PROJ}/risk-catalog.md"
printf '%s\n' '使い方' > "${PROJ}/user-flows.md"
printf '%s\n' '# P {{ISSUE}}' 'ここに {{RISK_CATALOG}} は埋めない' '{{RISK_CATALOG}}' > "${WORK}/p.md"
printf '%s\n' '## R' '{{PROJECT_CONTEXT}}' > "${WORK}/r.md"
render() {
  ( cd "${WORK}" && env AI_FLOW_PROJECT_DIR="${PROJ}" ISSUE=7 TEST_CMD='a && b | c/d \e' "$@" 2>&1 )
}
# 行の途中の {{RISK_CATALOG}} はファイルに置き換えない（そのまま残るので埋め残しで落ちる）
out=$(render "${RENDER}" p.md r.md); got=$?
expect "render-prompt（埋め残しは止める）" 1 "埋まらなかったプレースホルダがあります: {{RISK_CATALOG}}" "${out}" "${got}"
printf '%s\n' '# P {{ISSUE}}' '{{TEST_CMD}}' '{{RISK_CATALOG}}' > "${WORK}/p.md"
out=$(render "${RENDER}" p.md r.md); got=$?
expected=$(printf '%s\n' '# P 7' 'a && b | c/d \e' '- 項目1' '' '## R' '## 前提' 'テストは `a && b | c/d \e`')
if [ "${got}" -ne 0 ] || [ "${out}" != "${expected}" ]; then
  ng "render-prompt（値の & | / \\ とファイルの埋め込み、空行を挟んだ連結）: 期待と違います。
期待:
${expected}
実際:
${out}"
else
  pass=$((pass + 1))
fi
out=$(render env TEST_CMD= "${RENDER}" p.md r.md); got=$?
expect "render-prompt（空の値は止める）" 1 "TEST_CMD が空です" "${out}" "${got}"
mv "${PROJ}/risk-catalog.md" "${PROJ}/risk-catalog.md.bak"
out=$(render "${RENDER}" p.md r.md); got=$?
expect "render-prompt（案件設定のファイルが無ければ止める）" 1 "risk-catalog.md が読めないか空です" "${out}" "${got}"

# --- render-prompt.sh の条件付きの区間（{{#if 名前}} 〜 {{/if}}） ---
# 値が空なら区間ごと消し（中のプレースホルダは空でも止めない）、空でなければ印の行だけを消す
printf '%s\n' 'A' '{{#if FORMAT_CHECK_CMD}}' 'fmt `{{FORMAT_CHECK_CMD}}`' '{{/if}}' 'B {{ISSUE}}' > "${WORK}/c.md"
out=$(render env FORMAT_CHECK_CMD= "${RENDER}" c.md); got=$?
if [ "${got}" -ne 0 ] || [ "${out}" != "$(printf '%s\n' A 'B 7')" ]; then
  ng "render-prompt（値が空なら区間ごと消す）: 期待と違います（終了コード ${got}）。
実際:
${out}"
else
  pass=$((pass + 1))
fi
out=$(render env FORMAT_CHECK_CMD='x --check' "${RENDER}" c.md); got=$?
if [ "${got}" -ne 0 ] || [ "${out}" != "$(printf '%s\n' A 'fmt `x --check`' 'B 7')" ]; then
  ng "render-prompt（値があれば印の行だけを消す）: 期待と違います（終了コード ${got}）。
実際:
${out}"
else
  pass=$((pass + 1))
fi
printf '%s\n' '{{#if FORMAT_CHECK_CMD}}' 'x' > "${WORK}/c1.md"
out=$(render env FORMAT_CHECK_CMD=x "${RENDER}" c1.md); got=$?
expect "render-prompt（閉じられていない区間は止める）" 1 "{{#if FORMAT_CHECK_CMD}} が閉じられていません" "${out}" "${got}"
printf '%s\n' '{{#if FORMAT_CHECK_CMD}}' '{{#if TEST_CMD}}' 'x' '{{/if}}' '{{/if}}' > "${WORK}/c2.md"
out=$(render env FORMAT_CHECK_CMD=x "${RENDER}" c2.md); got=$?
expect "render-prompt（入れ子は止める）" 1 "入れ子にできません" "${out}" "${got}"
printf '%s\n' '{{#if NO_SUCH_KEY}}' 'x' '{{/if}}' > "${WORK}/c3.md"
out=$(render "${RENDER}" c3.md); got=$?
expect "render-prompt（一覧に無い名前は止める）" 1 "値のプレースホルダの一覧にありません" "${out}" "${got}"
printf '%s\n' 'x' '{{/if}}' > "${WORK}/c4.md"
out=$(render "${RENDER}" c4.md); got=$?
expect "render-prompt（対応の無い {{/if}} は止める）" 1 "対応する {{#if …}} の無い {{/if}}" "${out}" "${got}"

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
  echo "selftest: run-phase.sh / render-prompt.sh の回帰テスト ${pass} 件すべて通過しました。"
fi
exit "${status}"
