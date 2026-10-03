#!/bin/bash
# 権限プロファイル（どの案件でも使う base）に、案件ごとの追加分を足し込んで標準出力に出す。
# 使い方: ./scripts/merge-permissions.sh <base のプロファイル>
#
# 案件ごとの追加分は .ai-flow/permissions.json の allow / deny（どちらも省略可）。
# claude-run.sh が claude を起動するたびに一時ファイルへ書き出して --settings に渡す。
# マージした結果を ai-flow/tmp/ などに残さないのは、エージェントがそれを書き換えると次のステップの
# 権限が広がるため（tmp/ は gitignore 対象なので run-phase.sh の作業ツリー検査にも出ない）。
# 追加分の元ファイル（.ai-flow/）は run-phase.sh の TOOLING_PATHS で保護している。
set -uo pipefail

BASE="${1:?base の権限プロファイルが必要です}"
PROJECT_DIR="${AI_FLOW_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)/.ai-flow}"
EXTRA="${PROJECT_DIR}/permissions.json"

for f in "$BASE" "$EXTRA"; do
  [ -f "$f" ] || { echo "Error: merge-permissions.sh: $f が見つかりません。" >&2; exit 1; }
  jq -e . "$f" >/dev/null 2>&1 || { echo "Error: merge-permissions.sh: $f を JSON として読めません。" >&2; exit 1; }
done

jq -s '
  .[0] as $base | .[1] as $extra
  | $base
  | .permissions.allow = (($base.permissions.allow // []) + ($extra.allow // []) | unique)
  | .permissions.deny = (($base.permissions.deny // []) + ($extra.deny // []) | unique)
' "$BASE" "$EXTRA"
