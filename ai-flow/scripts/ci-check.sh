#!/bin/bash
# このリポジトリ単体で make check を走らせる。手元でも CI（.github/workflows/check.yml）でも使う。
# 使い方: ./scripts/ci-check.sh（リポジトリのルートで実行）
#
# フローは取り込み先のサブディレクトリに置かれ、ルートに案件設定（.ai-flow/）がある前提で動く
# （scripts/flow-paths.sh）。このリポジトリではフローがルートにあるので、そのままでは make check が
# 「ルートに置かれています」で止まる。そこで使い捨ての git リポジトリを作り、取り込み先と同じ形
# （フロー一式を ai-flow/ に、examples/project/.ai-flow/ をルートに）に並べてから make check を走らせる。
# ひな形の config.mk が make check を通る形になっているかも、これで確かめられる。
#
# コピーするのは git が追跡しているファイルと、無視されていない新規ファイル（作業中の変更も含む）。
# .env や tmp/ は持ち込まない。
set -uo pipefail

SRC=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d) || { echo "NG: 一時ディレクトリを作れませんでした。" >&2; exit 1; }
trap 'rm -rf "${WORK}"' EXIT

HOST="${WORK}/host"
FLOW="${HOST}/ai-flow"
mkdir -p "${FLOW}"
git -C "${HOST}" init -q
# Makefile が origin から Issue の URL を組み立てるので、取り込み先と同じく origin を置く（接続はしない）
git -C "${HOST}" remote add origin https://github.com/example/host.git

git -C "${SRC}" ls-files -z --cached --others --exclude-standard | while IFS= read -r -d '' f; do
  [ -f "${SRC}/${f}" ] || continue   # 作業ツリーで消したファイルは持ち込まない
  mkdir -p "${FLOW}/$(dirname "${f}")"
  cp -p "${SRC}/${f}" "${FLOW}/${f}"
done

[ -d "${SRC}/examples/project/.ai-flow" ] \
  || { echo "NG: examples/project/.ai-flow がありません。" >&2; exit 1; }
cp -R "${SRC}/examples/project/.ai-flow" "${HOST}/.ai-flow"

git -C "${HOST}" add -A
git -C "${HOST}" -c user.name=ci -c user.email=ci@example.com commit -q -m "ci-check"

make -C "${FLOW}" check || exit 1

# フォーマッタが無い案件の形（FORMAT_* をすべて空）でも、プロンプトが生成できて make check が通るか
echo "--- FORMAT_* を空にして再実行"
make -C "${FLOW}" check FORMAT_CHECK_CMD= FORMAT_FILE_CMD= FORMAT_FIX_CMD= FORMAT_GLOBS=
