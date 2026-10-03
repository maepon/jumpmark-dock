#!/bin/bash
# プロンプトのプレースホルダを埋めて標準出力に出す。claude-run.sh から呼ぶ。
# 使い方: ./scripts/render-prompt.sh <ファイル>...（複数なら空行を1行挟んで連結する）
#
# 埋めるものは2種類。
#   - 値      {{ISSUE}} など。同名の環境変数の値に置き換える。一覧は下の VALUE_KEYS
#   - ファイル 行全体が {{PROJECT_CONTEXT}} などの行を、案件設定（.ai-flow/）のファイルの中身に置き換える。
#             一覧は下の INCLUDES。中身の値のプレースホルダも埋める（ファイルの入れ子はしない）
#
# sed の置換では埋めない。置換文字列の & はマッチ全体を表すので、値に & が入ると壊れる
# （TEST_CMD に npm test && … と書いたとき）。区切り文字の | も同じ。bash の ${var//…} も
# bash 5.2 からは & が特別な意味を持つ。awk の index / substr で文字列として置き換える。
#
# 値が空のプレースホルダと、埋めた後に残った {{…}} は、claude を起動する前（課金の前）に止める。
set -uo pipefail

VALUE_KEYS="ISSUE VERDICT_FILE COMMENT_FILE PR_TITLE_FILE PR_BODY_FILE BASE_BRANCH TEST_CMD SCRATCH_TEST_CMD FORMAT_CHECK_CMD FORMAT_FILE_CMD FORMAT_FIX_CMD FORMAT_GLOBS OUTPUT_LANG"
INCLUDES="PROJECT_CONTEXT=context.md RISK_CATALOG=risk-catalog.md USER_FLOWS=user-flows.md"

[ $# -gt 0 ] || { echo "Error: render-prompt.sh: ファイルが必要です。" >&2; exit 1; }
for f in "$@"; do
  [ -f "$f" ] || { echo "Error: render-prompt.sh: $f が見つかりません。" >&2; exit 1; }
done

PROJECT_DIR="${AI_FLOW_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)/.ai-flow}"
export PROJECT_DIR VALUE_KEYS INCLUDES

out=$(LC_ALL=C awk '
  BEGIN {
    nkeys = split(ENVIRON["VALUE_KEYS"], keys, " ")
    n = split(ENVIRON["INCLUDES"], inc, " ")
    for (i = 1; i <= n; i++) {
      eq = index(inc[i], "=")
      incfile["{{" substr(inc[i], 1, eq - 1) "}}"] = ENVIRON["PROJECT_DIR"] "/" substr(inc[i], eq + 1)
    }
    err = 0
  }
  # 前から順に置き換えて、置き換えた値はもう一度見ない（値に {{…}} が入っていても展開しない）
  function fill(line,    i, ph, val, p, done) {
    for (i = 1; i <= nkeys; i++) {
      ph = "{{" keys[i] "}}"
      if (index(line, ph) == 0) continue
      val = ENVIRON[keys[i]]
      if (val == "") {
        printf "Error: render-prompt.sh: %s が空です（%s で使われています）。\n", keys[i], FILENAME > "/dev/stderr"
        err = 1
      }
      done = ""
      while ((p = index(line, ph)) > 0) {
        done = done substr(line, 1, p - 1) val
        line = substr(line, p + length(ph))
      }
      line = done line
    }
    return line
  }
  FNR == 1 && NR != 1 { print "" }
  $0 in incfile {
    f = incfile[$0]
    if ((getline l < f) <= 0) {
      printf "Error: render-prompt.sh: %s が読めないか空です（%s で使われています）。\n", f, FILENAME > "/dev/stderr"
      err = 1
      next
    }
    do { print fill(l) } while ((getline l < f) > 0)
    close(f)
    next
  }
  { print fill($0) }
  END { exit err }
' "$@") || exit 1

left=$(printf '%s\n' "$out" | LC_ALL=C grep -oE '\{\{[A-Z_]+\}\}' | sort -u | tr '\n' ' ')
if [ -n "$left" ]; then
  echo "Error: render-prompt.sh: 埋まらなかったプレースホルダがあります: ${left}" >&2
  exit 1
fi

printf '%s\n' "$out"
