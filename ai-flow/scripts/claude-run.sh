#!/bin/bash
# Claude Code をヘッドレスで1回だけ実行する。フェーズの筋書きは run-phase.sh 側。
#
# 使い方: ./scripts/claude-run.sh <プロンプトファイル> <モデルID> <Issue番号> <権限プロファイル>
#
# 標準出力にはエージェントの返答だけを出す（呼び出し側が変数に取れるように）。
# 進捗・コスト・拒否の警告は標準エラーへ。
#
# 権限ファイルの名前が settings.json でないのには理由がある（実測）。
#   - .claude/settings.json は workspace が trust されていないと、--settings で
#     明示的に渡しても permissions.allow が丸ごと無視される
#     （警告は stderr に出るだけで終了コードは 0 のまま＝黙って無権限になる）
#   - 既定パス以外のファイル名を --settings に渡した場合は allow も deny も効く
#   - deny を settings.json に置くと人間の対話セッションまで縛られ、
#     自分で commit / push できなくなる（deny は承認プロンプトを出さずにブロックする）
#
# ファイル系ツールの権限も素直ではない（実測）。
#   - Write / Edit にパスを付けたルールは allow も deny も一切マッチしない。
#     Write(./**) Write(**) Write(tmp/**) 絶対パス形（Write(//Users/...)）
#     すべて拒否された。裸の Write / Edit だけが効く
#   - Read はパス指定が効く。deny Read(./.env) は裸の allow Read にも勝つ（実測）
#   - Claude Code 自身が .claude/ 配下への書き込みを塞ぐので、エージェントが
#     自分の権限プロファイルを書き換えることはできない。
#     ただし prompts/ や scripts/ は素通りするため、run-phase.sh が作業ツリーで検査する
#   - deny によるブロックは permission_denials に出ず、ツールのエラーとして返る
#
# 権限の deny は「事故の防止」であって「隔離」ではない。テストの実行（TEST_CMD）を許可している以上、
# エージェントは任意のコードを実行できるので、その気になれば deny した操作にも到達する。
# 実効的な防波堤は次の3つで、権限リストはその外側の注意書きに近い。
#   1. .claude/ への書き込みは Claude Code 自身が塞ぐ（自分の権限を広げられない）
#   2. run-phase.sh が各ステップ後に作業ツリーを見て、基盤ファイルの改変で中断する
#   3. push と gh pr create はそもそも渡さず、run-phase.sh が検査してから実行する
# したがって、渡す環境変数にシークレットを残さないこと（下の env -u を参照）。
#
# ツール呼び出しが拒否されても claude の終了コードは 0 になるため、
# JSON出力の permission_denials を見て標準エラーに出す。

set -uo pipefail

PROMPT_FILE="${1:?プロンプトファイルが必要です}"
MODEL="${2:?モデルIDが必要です}"
ISSUE="${3:?Issue番号が必要です}"
SETTINGS="${4:?権限プロファイルが必要です}"

RULES="prompts/_rules.md"
VERDICT_FILE="${VERDICT_FILE:-./tmp/verdict-issue$ISSUE.txt}"
COST_LOG="${COST_LOG:-}"
COMMENT_FILE="./tmp/issue$ISSUE-$(basename "$PROMPT_FILE" .md).md"
PR_TITLE_FILE="${PR_TITLE_FILE:-./tmp/pr-title-issue$ISSUE.txt}"
PR_BODY_FILE="${PR_BODY_FILE:-./tmp/pr-body-issue$ISSUE.md}"
BASE_BRANCH="${BASE_BRANCH:-main}"

for f in "$PROMPT_FILE" "$RULES" "$SETTINGS"; do
  [ -f "$f" ] || { echo "Error: $f が見つかりません。" >&2; exit 1; }
done

mkdir -p tmp

# フローのディレクトリの場所。プロンプトの {{FLOW_DIR}} / {{ROOT_REL}} に埋める
. ./scripts/flow-paths.sh
[ -z "${flow_paths_error}" ] || { echo "Error: ${flow_paths_error}" >&2; exit 1; }

# 各プロンプトに共通ルールを連結し、プレースホルダを埋める（値と案件設定のファイル。詳細は render-prompt.sh）。
# 埋まらないものがあれば、claude を起動する前に止まる
PROMPT=$(ISSUE="$ISSUE" VERDICT_FILE="$VERDICT_FILE" COMMENT_FILE="$COMMENT_FILE" \
  PR_TITLE_FILE="$PR_TITLE_FILE" PR_BODY_FILE="$PR_BODY_FILE" BASE_BRANCH="$BASE_BRANCH" \
  ./scripts/render-prompt.sh "$PROMPT_FILE" "$RULES") || exit 1

# 権限は base のプロファイルに案件ごとの追加分（.ai-flow/permissions.json）を足したものを、
# 起動のたびに一時ファイルへ書き出して渡す。残さない理由は merge-permissions.sh の冒頭
MERGED_SETTINGS=$(mktemp) || { echo "Error: 一時ファイルを作れませんでした。" >&2; exit 1; }
trap 'rm -f "$MERGED_SETTINGS"' EXIT
./scripts/merge-permissions.sh "$SETTINGS" > "$MERGED_SETTINGS" || exit 1

# SLACK_WEBHOOK_URL はエージェントの環境から外す。Makefile が export しているので
# 何もしないと継承され、echo $SLACK_WEBHOOK_URL で読めてしまう（Read(./.env) の deny が無意味になる）。
# Slack通知は親（run-phase.sh）が送るので、エージェント側には要らない。
# 起動のオプション（いずれも試し先のリポジトリで実際に踏んだもの）
#   --add-dir=<ルート>   エージェントはフローのディレクトリをカレントにして動くので、何もしないと Claude Code は
#                        そこを作業ディレクトリとみなし、外を指すパスを引数に取る Bash（git diff -- ../../README.md、
#                        git grep -- ../x.html など）を拒否する。リポジトリのルートを作業ディレクトリに足して通す。
#                        Read / Write / Edit はもともと外のファイルにも届いていたので、実行できる範囲は広がらない。
#                        「=」で渡すこと。--add-dir は値を複数取るので、空白で区切ると後ろのプロンプトまで飲み込む
#   --strict-mcp-config  利用者の claude.ai に連携したコネクタ（MCP）を読み込まない。フローは使わないうえ、
#                        ツールの説明が毎ステップのプロンプトに乗り、返答に認証を促す一文が混ざっていた
#   < /dev/null          標準入力を待たない（渡さないと「no stdin data received in 3s」の警告が出て3秒待つ）
REPO_ROOT=$(git rev-parse --show-toplevel) || { echo "Error: リポジトリのルートが分かりません。" >&2; exit 1; }
OUT=$(env -u SLACK_WEBHOOK_URL ANTHROPIC_MODEL="$MODEL" claude -p \
  --settings "$MERGED_SETTINGS" \
  --add-dir="$REPO_ROOT" \
  --strict-mcp-config \
  --output-format json \
  "$PROMPT" < /dev/null)
STATUS=$?

if [ $STATUS -ne 0 ]; then
  printf '%s\n' "$OUT" >&2
  echo "Error: claude が終了コード $STATUS で終了しました。" >&2
  exit 1
fi

if ! printf '%s' "$OUT" | jq -e . >/dev/null 2>&1; then
  printf '%s\n' "$OUT" >&2
  echo "Error: claude の出力をJSONとして解釈できませんでした。" >&2
  exit 1
fi

COST=$(printf '%s' "$OUT" | jq -r '.total_cost_usd')
TURNS=$(printf '%s' "$OUT" | jq -r '.num_turns')
[ -n "$COST_LOG" ] && printf '%s\n' "$COST" >> "$COST_LOG"
printf -- '    （%s / コスト: $%.2f / ターン数: %s）\n' "$MODEL" "$COST" "$TURNS" >&2

# 拒否は失敗とは限らない。エージェントが別手段で回避して完遂する場合があるため
# 停止させず、人間が気付けるように出しておく
DENIALS=$(printf '%s' "$OUT" | jq -r '.permission_denials | length')
if [ "$DENIALS" != "0" ]; then
  echo "警告: 許可されていないツール呼び出しが ${DENIALS} 件拒否されました。" >&2
  printf '%s' "$OUT" \
    | jq -r '.permission_denials[] | "  拒否: \(.tool_name) — \(.tool_input.command // .tool_input.file_path // "")"' >&2
  echo "  繰り返し出るなら $SETTINGS の permissions.allow（案件に固有のコマンドなら .ai-flow/permissions.json の allow）に追加してください。" >&2
fi

if [ "$(printf '%s' "$OUT" | jq -r '.is_error')" != "false" ]; then
  echo "Error: claude がエラーを報告しました。" >&2
  exit 1
fi

printf '%s\n' "$(printf '%s' "$OUT" | jq -r '.result')"
