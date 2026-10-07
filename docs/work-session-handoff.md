# 作業引き継ぎ記録 - 2026-10-07 更新

作業を始める前に読む、いまの状況のまとめ。過去の経緯は `CHANGELOG.md` と git の履歴にある。

## 現在の状況

- **公開中のバージョン**: v2.4.1（2026-10-07 に Chrome ウェブストアで公開。タグ `v2.4.1`、GitHub Release「Jumpmark Dock v2.4.1」）
  - Jumpmark をクリックしたとき、すでに開いているタブを探す判定を、URL の表記の揺れ（末尾の `/`・`#` 以降・大文字小文字・既定ポート）に強くした（#43）
  - ストアの説明文は、Scoped Bookmark を軸にした `docs/chrome-store-listing.{ja,en}.txt`（#61）に差し替え済み
- **リリース準備中のバージョン**: v2.4.2（タグ `v2.4.2`。Chrome ウェブストアへの提出はこれから）
  - 使っていなかった `host_permissions`（`<all_urls>`）を削除した（#64）。ストアに提出するときは、ダッシュボードの「権限の理由」からホスト権限の説明がなくなる。公開しているプライバシーポリシーがあれば、`docs/privacy-policy.md`（#64、#65 で更新）に合わせて更新する
- **次のバージョンに入る変更**（`CHANGELOG.md` の `[Unreleased]`）: 拡張機能の変更はなし。リリース用のワークフローの重複（`build.yml`）を削除した
- **未着手の Issue**
  - #37 保存するデータの持ち方を詰めて、同じ容量に入る Jumpmark の件数を増やす。v2.4.0 と新しいバージョンが同じアカウントで混在する間に、データが壊れたり消えたりしない形を指示書で決めるところから

## v2.4.0 で入ったもの（以降の作業の前提）

- 保存先を `chrome.storage.sync` の 64 個のバケットに分け、使える容量を約 8KB から約 100KB に広げた（#30）。仕組みは `CLAUDE.md` の「Storage Schema」と README の「データ構造」を参照
- v2.3.0 以前の形式の `jumpmarks` 項目は、旧バージョンとの互換のため残している（書き換えも削除もしない）。読み込んだ id は `jm:meta` に記録する
- `chrome.storage` へのアクセスは `shared.js` の入口（`readJumpmarksStore` / `writeJumpmarksStore` / `onJumpmarksChanged`）に限る。保存の形を変えるときは、この内側だけで変換する

## リリースの流れ

1. `manifest.json` の `version` と `CHANGELOG.md` を更新する（`package.json` の `version` は拡張機能のバージョンではない）
2. `v<バージョン>` のタグを push すると、`.github/workflows/package.yml` がストア提出用の zip（`jumpmark-dock-v<バージョン>.zip`）を作り、GitHub Release を作る（タグで動くワークフローはこれだけ）
3. zip を Chrome ウェブストアに提出する。説明文を変えるときは、プレーンテキストの `docs/chrome-store-listing.{ja,en}.txt` を貼る（Markdown は解釈されない）
4. 公開されたら、この文書の「現在の状況」を更新する

## 開発の進め方

- **確認**: `npm test`（`shared.js` のロジックの smoke test）と `npm run format:check`。CI（`.github/workflows/ci.yml`）でも同じものが動く
- **AI による自動化（`ai-flow/`）**: Issue から指示書・実装・レビュー・PR までを Claude Code で進める仕組み（`make spec ISSUE=n` → `make impl ISSUE=n`）。いまは maepon/issue-to-pr-flow v0.9.0 を取り込んでいる
  - `ai-flow/` の中は編集しない。直すときは issue-to-pr-flow で PR を出してタグを付け、そのタグを `git subtree merge` で取り込む（手順は `CLAUDE.md` の「AI-Assisted Development Flow」）
  - 案件ごとの設定はルートの `.ai-flow/`。通知などの個人の設定は `ai-flow/.env`（git の管理外）
- `master` は署名付きコミットが必須で、変更は PR を通して入れる
