#!/bin/bash
# フローのディレクトリの場所を求める。run-phase.sh / claude-run.sh / check-scripts.sh / selftest.sh が source する。
# フローのディレクトリ（Makefile のある場所）をカレントにして読み込むこと。
#
# フローは任意の名前・深さのサブディレクトリに置ける（ai-flow/、tools/flow/ など）。名前を直書きすると、
# 変えたときに TOOLING_PATHS が基盤ファイルの改変を素通りさせる（静かに壊れる）ので、ここで求めた値だけを使う。
#
#   FLOW_PREFIX     リポジトリのルートからフローのディレクトリまで。末尾に / が付く   例: ai-flow/  tools/flow/
#   FLOW_DIR        FLOW_PREFIX の末尾の / を除いたもの                                例: ai-flow   tools/flow
#   ROOT_REL        フローのディレクトリからルートへの相対パス。末尾に / が付く       例: ../       ../../
#   FLOW_PREFIX_RE  FLOW_PREFIX を grep -E で文字どおりに当てるためにエスケープしたもの
#                   （しないと tools/ai.flow/ の . がどの文字にも当たる）
#
# ルートに置くこと（FLOW_PREFIX が空）はサポートしない。フローの Makefile / scripts/ / docs/ が
# 案件の同名のファイルと区別できなくなり、TOOLING_PATHS が案件のファイルを基盤扱いするため。
# 読み込み側が判断できるように、ここでは止めずに flow_paths_error に理由を入れて返す。

flow_paths_error=""
FLOW_PREFIX=$(git rev-parse --show-prefix 2>/dev/null) \
  || flow_paths_error="git リポジトリの中で実行してください。"
if [ -z "${flow_paths_error}" ] && [ -z "${FLOW_PREFIX}" ]; then
  flow_paths_error="フローがリポジトリのルートに置かれています。サブディレクトリ（ai-flow/ など）に置いてください。"
fi
FLOW_DIR="${FLOW_PREFIX%/}"
ROOT_REL=$(printf '%s' "${FLOW_PREFIX}" | sed -e 's,[^/][^/]*/,../,g')
FLOW_PREFIX_RE=$(printf '%s' "${FLOW_PREFIX}" | sed -e 's/[][\.*^$+?(){}|]/\\&/g')
export FLOW_PREFIX FLOW_DIR ROOT_REL FLOW_PREFIX_RE
