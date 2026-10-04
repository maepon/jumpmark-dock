# AI開発フロー（ai-flow/）の案件ごとの設定。ai-flow/Makefile が include する。
#
# 個人の設定（通知・モデルID）は ai-flow/.env に書く。こちらは案件で共通なのでコミットする。
# Makefile の構文で書く。値はクォートしない（スクリプト側で単語に分けて実行する）。
# make の引数（make impl BASE_BRANCH=main など）で一時的に上書きできる。

# PR のベースにするブランチ。scripts/ と prompts/ はこの値だけを使う（直書きは make check が落とす）
# このリポジトリの既定ブランチは master（main ではない）
BASE_BRANCH = master

# テストを全部走らせるコマンド。エージェントはこれでテストの合否を確かめる。必須
TEST_CMD = npm test

# 使い捨てのテストファイル（ai-flow/tmp/ の下）を1つ走らせるコマンド。後ろにファイル名が付く
SCRATCH_TEST_CMD = node --test

# リポジトリ全体の整形チェック。どのディレクトリから実行しても同じ結果になるコマンドにする
# （npm run はルートの package.json を見つけてルートで実行する）
FORMAT_CHECK_CMD = npm run format:check

# 1ファイルの整形チェック。後ろにファイルの絶対パスが付く。整形済みなら終了コード 0 を返すこと。
# 空にすると、run-phase.sh の整形チェックを丸ごと飛ばす（フォーマッタが無い案件向け）
FORMAT_FILE_CMD = npx prettier --check

# 未整形のファイルを直すコマンド。後ろにファイル名が付く。中断メッセージとプロンプトで案内する
FORMAT_FIX_CMD = npx prettier --write

# 整形チェックの対象にするファイル（シェルの case のパターン。空白区切り）
FORMAT_GLOBS = *.js *.css *.html

# Issue コメント・コミットメッセージ・PR など、人が読む出力の言語
OUTPUT_LANG = 日本語
