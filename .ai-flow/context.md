## この案件の前提

- ルートの `CLAUDE.md` / `README.md` に従う。仕様を確かめるときは必ず読む
- 案件のファイルは `../popup.js` のようにルートからの相対で読む
- 案件の変更対象になるドキュメントは `README.md` / `CHANGELOG.md` / ルートの `docs/` など、この案件側のものだけ。
  実装したら、該当する `CLAUDE.md` / `README.md` を更新する
- 整形の確認に `npx prettier --check "**/*.js"` を使わない。実行した場所（`ai-flow/`）以下しか見ないので、
  リポジトリ全体の確認にならない。`{{FORMAT_CHECK_CMD}}` は npm がルートで実行する
