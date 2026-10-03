# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Jumpmark をクリックしたとき、同じページのタブを探す判定で、末尾の `/`・`#` 以降・大文字小文字・既定ポート（`:443` / `:80`）の違いを同じページとみなすようにした（双方向リンクの戻りの Jumpmark で、すでに開いているタブがあるのに新しいタブが開く問題の修正）。ただし Jumpmark の URL に `#` 以降があるときは `#` 以降まで比べる（`#` で画面を切り替えるページで、別の画面を指す Jumpmark が既存タブへの切り替えだけで終わらないようにするため）。クエリ・スキーム・`www.` の違いは、これまでどおり別のページとして扱う。あわせて popup と options で重複していた `navigateToUrl` を `shared.js` の1つにまとめた

## [2.4.0] - 2026-10-03

### Added

- ストア掲載用の説明文の英語版 `docs/chrome-store-description.en.md` を追加した（日本語版 `docs/chrome-store-description.md` と同じ内容・構成）
- ストアの説明文欄にそのまま貼るプレーンテキスト `docs/chrome-store-listing.ja.txt` / `docs/chrome-store-listing.en.txt` を追加した。掲載中の説明文の構成を土台に、「外部通信なし」「102KB・最大512個」など事実と異なる記述を除き、Chrome 同期で Google を経由すること、双方向リンク、開いているタブからの入力を書き加えた
- popup の新規追加フォームを開いたとき、保存容量の使用率が 90% 以上なら警告を表示するようにした
- ストア掲載文（`docs/chrome-store-listing.{ja,en}.txt`）と元の文章（`docs/chrome-store-description{,.en}.md`）に、「Scoped Bookmark」（作成元のページ（スコープ）を開いたときだけ出てくるブックマーク）という考え方を取り入れ、普通のブックマークとの違いを書いた。ワイルドカード登録とバッジの説明も、スコープの考え方で言い換えた

### Changed

- 拡張機能の短い説明（`extDescription`。ストアの概要と `chrome://extensions` に出る）を、「Scoped Bookmark」を使った説明に変えた。ストア掲載文の冒頭の一文もこれにそろえ、`docs/chrome-store-description{,.en}.md` の古い「一行説明」も同じ文にした
- `docs/chrome-store-description.md` の「チームでの情報共有」の見出しを、内容（同じ Google アカウントの複数デバイスで同期）に合わせて「自分のデバイス間で共有」に改めた
- `README.md` / `CLAUDE.md` の `chrome.storage.sync` の上限の記述を、公式ドキュメントの値（1項目8,192バイト）と、全データを1項目に保存しているため実際の上限が約8KBであることに合わせて改めた
- `docs/chrome-webstore-description-update.md` の冒頭に、事実と異なる記述を含む古い下書きである旨の注記を入れた
- オプションページの容量表示を、実際の上限（1項目 8,192 バイト）に対する UTF-8 バイト数で表示するようにした（文言・バー・色・警告の閾値）。これまでは 102KB を上限として文字数で数えていたため、保存できなくなる 8KB 付近でもバーがほとんど伸びなかった
- 保存・更新・インポートの前にデータの大きさを確かめ、上限を超える場合は保存せず、容量不足と対処を伝える文言を出すようにした
- `chrome.storage` の読み書きと変更の監視を `shared.js` の入口（`readJumpmarksStore` / `writeJumpmarksStore` / `onJumpmarksChanged`）にまとめた。あわせて、popup の削除が `shared.js` の `deleteJumpmark` を使うようにした（画面の挙動は変わらない）
- 保存先を `jumpmarks` の 1 項目から、作成元 URL のハッシュで決まる最大 64 個のバケット（`jm:<番号>`。入りきらない分は `jm:<番号>:<i>` の続き項目）と `jm:meta` に分け、使える容量を約 8KB から約 100KB（`storage.sync` 全体の上限 102,400 バイト）に広げた。Jumpmark 1 件は約 8KB まで。`readJumpmarksStore()` が返す形は今までと同じ。内容が変わったバケットだけを書き換える
- 容量の表示（オプションページ・popup の追加フォームの警告）とエラーの文言を、新しい上限（全体 100KB）に合わせた。使用量は `storage.sync` の全項目（旧形式の `jumpmarks` と `jm:meta` を含む）の合計で数える。上限は全体・1 項目・項目数（512）の 3 つを保存前に確かめる
- 変更の監視（`onJumpmarksChanged`）は、`jumpmarks` または `jm:` で始まる項目の変更を 100 ミリ秒ごとに 1 回にまとめて通知するようにした（1 回の保存で複数項目が変わるため）
- popup で双方向の Jumpmark を作るとき、戻りの Jumpmark のタイトルを、行き先のタイトルではなく作成元ページ（popup を開いているタブ）のタイトルにした（`← <作成元ページのタイトル>`。タブのタイトルが空なら作成元 URL）。作成元 URL を今のタブと違うものにしたとき、既存の戻りの Jumpmark があるときは今までどおり。オプションページの挙動は変わらない

#### 既存ユーザーへの影響

- 既存のデータは、読み込み時に新しい形式のデータとして扱われ、次の保存・編集・削除・インポートのときに新しい形式（バケット）で書かれる。旧形式の `jumpmarks` 項目は旧バージョンとの互換のため削除せず、書き換えもしない
- 新旧バージョンが混在する間の食い違い:
  - 旧バージョンの端末からは、新バージョンで追加・編集・削除した内容は見えない
  - 旧バージョンの端末で追加した Jumpmark は、新バージョンにも表示される
  - 旧バージョンの端末での既存の Jumpmark の編集・削除は、新バージョンには反映されない（新バージョンで削除したものは、旧バージョンが古いデータを書き戻しても復活しない）
  - 旧形式の `jumpmarks` 項目（最大約 8KB）の分も、使用量に含まれる
- 並び順の変化: 作成元 URL の順が「作った順」から「バケット番号の昇順、同じバケット内は作成元 URL の昇順」に変わる。popup で同じページに複数の作成元 URL（完全一致とワイルドカードなど）の Jumpmark があるとき、グループの並び順が変わることがある。エクスポートファイル内の並び順も変わることがある

### Fixed

- popup で Jumpmark の削除に失敗したとき、何も表示されなかったのを、エラーを表示するようにした

## [2.3.0] - 2026-10-01

### Added

- 追加フォームに「開いているタブから選ぶ」一覧を追加した。タブを選ぶとタイトルと URL が自動入力される
- タブ情報は一覧を開いたときだけ取得する。現在のタブ、`http(s)` 以外のページ、シークレット状態が現在のタブと異なるタブは一覧から除外する

### Changed

- `docs/privacy-policy.md` の tabs 権限・収集しないデータの記述を、実際の挙動（バッジ更新のための全タブの URL 照合、既存タブへの切り替え、タブ一覧機能）に合わせて改訂した
- `docs/chrome-store-description.md` の tabs 権限の説明を同様に改訂した
- `docs/privacy-policy.md` から根拠のない「暗号化」の記述を削除し、「外部送信・外部通信なし」「処理はブラウザ内で完結」の記述を、Chrome 同期を有効にしている場合の Google を経由した同期を除く形に改めた
- `docs/chrome-store-description.md` の「データ暗号化」「外部サーバーへの通信は一切なし」「処理はブラウザ内で完結」の記述を同様に改めた
- `docs/privacy-policy.md` の「ローカルで保存」「ローカルストレージ」「ローカルで管理」の記述を、`chrome.storage.sync` に保存し、Chrome 同期を有効にしている場合は Google のサーバーを経由して同期される、という実際の挙動に合わせて改めた。見出し「ローカルストレージ」を「データの保存先」に、「自動削除」を「アンインストール時の扱い」に改め、アンインストールでデータが削除されると断言する記述をやめた
- `docs/chrome-store-description.md` の storage 権限の用途にある「ローカルストレージに保存」を、`chrome.storage.sync` に保存する旨に改めた

## [2.2.2] - 2026-09-29

### Security

HTMLエクスポートで、`javascript:` などの危険なスキームを持つURLがクリック可能なリンクとして書き出されるのを防ぎました。

- **`options.js`** のHTMLエクスポートで、`http:` / `https:` 以外のスキームの URL を `<a href>` ではなくリンクでないテキスト（`<span>`）として出力するようにした
- **`options.js`** に判定関数 `isSafeLinkUrl()` を追加した（`new URL().protocol` で判定し、パース失敗・文字列以外は安全側で非リンク扱い）

## [2.2.1] - 2026-09-28

### Security

インポートしたJSONの `icon` / `url` に由来するHTML / 属性注入を防ぐため、描画時のエスケープ処理を強化しました。

- **`popup.js`** のJumpmark一覧のアイコン表示を `escapeHtml()` 経由にした
- **`options.js`** の管理テーブルのアイコン表示を `escapeHtml()` 経由にした
- **`options.js`** のHTMLエクスポートのアイコン表示を `escapeHtml()` 経由にした
- **`options.js`** のHTMLエクスポートの `href` 属性値を `escapeHtml()` 経由にした

## [2.2.0] - 2026-09-26

### Added

#### 🌐 多言語対応（英語）
- **`_locales/en`・`_locales/ja` によるメッセージリソース**を追加し、`chrome.i18n` ベースの英語UI対応を実装
- **`i18n.js`** を新規追加し、`data-i18n` / `data-i18n-placeholder` / `data-i18n-title` / `data-i18n-unit` 属性を持つ静的DOM要素へ翻訳メッセージを適用
- **`manifest.json` に `default_locale: "en"` を追加**し、Chromeの表示言語設定に応じて英語/日本語のUIが自動的に切り替わるように

### Changed

- **popup / options の全UI文字列を `chrome.i18n` 経由の翻訳メッセージに変更**
- **日付整形を `ja-JP` 固定から表示ロケール追従（`getUiLocale()`）に変更**（画面表示・CSV/HTMLエクスポート双方）
- **`options.css` の `content: "件"` を `content: attr(data-unit)` に変更**し、単位表示もロケールに追従
- **GitHub Actionsのパッケージ対象に `_locales` と `i18n.js` を追加**（`build.yml` / `package.yml`）
- **既存ユーザーへの影響**: Chromeの表示言語を日本語以外に設定しているユーザーは、本リリース以降UIが英語表示になります

## [2.1.0] - 2026-08-01

### Changed

#### ✨ Popup 新規登録フローの改善
- **新規追加時のアイコン入力を省略**し、フォームをよりシンプルに
- **新規保存時のアイコンを `🔖` で明示保存**し、表示とデータの一貫性を向上
- **編集時のアイコン変更は従来どおり維持**（編集モードではアイコン入力欄を表示）

## [2.0.0] - 2026-07-24

### Added

#### 🃏 Wildcard URL Support
- **Wildcard source URLs** by appending `*` to the end of a source URL
- **Directory and subdomain matching** for pages under the same path prefix
- **Wildcard-aware badge counting** with service worker cache rebuild support

#### 🔗 Protocol Preservation Improvements
- **Safer protocol fallback** for localhost, IPv4, IPv6, and ported `.local` hosts
- **Robust URL parsing** for reverse links when source URLs omit protocol information

### Changed

#### 🏗️ Refactoring
- **Shared URL parsing** centralized in `parseUrlPattern()` inside `shared.js`
- **Popup wildcard state handling** separated into state transition logic and UI rendering
- **Options page edit flow** simplified by consolidating bidirectional checkbox handling

### Fixed

#### 🐛 Bug Fixes
- **Middle asterisk handling** now preserves patterns such as `foo*bar*`
- **Wildcard edit behavior** no longer reintroduces checked state during normal typing
- **IPv6 and local host detection** now handles loopback, ULA, link-local, and ported `.local` cases more safely

## [1.1.0] - 2025-07-11

### Added

#### 🆕 Import/Export System
- **Complete import/export functionality** with support for JSON, CSV, and HTML formats
- **Drag & drop file import** - simply drop JSON files into the import area
- **Smart duplicate detection** with configurable merge options during import
- **Data validation** with comprehensive error handling for malformed files
- **Export range selection** - export all jumpmarks, selected items, or filtered results
- **Import preview** showing statistics before execution (total, new, duplicates)

#### 🎨 Advanced Management UI
- **Options page** with comprehensive jumpmark management interface
- **Search and filtering** with real-time results across titles and URLs
- **Bulk operations** - select multiple jumpmarks for deletion or export
- **Sorting options** by creation date, title, or URL
- **Storage usage display** with visual progress bar (Chrome Sync 102KB limit)
- **Dark mode support** automatically following system preferences

#### 🔧 Technical Improvements
- **Enhanced URL normalization** with automatic protocol detection and addition
- **Improved error handling** throughout the application with user-friendly messages
- **Better table interaction** - only URL column is clickable to prevent accidental navigation
- **Real-time status feedback** during import/export operations
- **Bidirectional link system refactor** using URL-match detection instead of flags

### Changed

#### 💡 User Experience
- **Table row clicking behavior** - restricted to URL column only to prevent accidental navigation
- **URL display styling** - clear visual indication of clickable links with blue color and underline
- **Import/export UI** - professional grid-based statistics display with visual hierarchy
- **Status indicators** - improved feedback during long-running operations

#### 🏗️ Architecture
- **Data structure modernization** - replaced `bidirectional` flags with `sourceUrl`-based relationship detection
- **Modular code organization** - extracted common utilities to `shared.js`
- **Enhanced CSS architecture** - comprehensive dark mode support across all components

### Fixed

#### 🐛 Bug Fixes
- **Import duplicate detection logic** - corrected to prevent false positives with bidirectional links
- **URL normalization errors** - robust handling of protocol-less URLs (e.g., "google.com")
- **Table interaction issues** - eliminated unintended page navigation when clicking near buttons
- **Storage listener conflicts** - resolved duplicate UI updates during edit/delete operations
- **Cross-platform compatibility** - improved handling of various URL formats and edge cases

#### 🔒 Data Integrity
- **Import validation** - comprehensive checking of file format and data structure
- **Error recovery** - graceful handling of corrupted or incomplete data
- **Backward compatibility** - seamless migration from older data formats

### Technical

#### 📦 Build & Deployment
- **GitHub Actions workflows** updated to include all new files (options.html, options.js, options.css, shared.js)
- **Automated packaging** for Chrome Web Store submission with validation
- **Release automation** with comprehensive artifact generation

#### 🔧 Code Quality
- **Error boundary implementation** - prevents application crashes from malformed data
- **Input sanitization** - enhanced security for user-provided data
- **Performance optimization** - efficient handling of large jumpmark collections

---

## [1.0.1] - 2025-07-08

### Added
- **Options page foundation** with basic jumpmark management interface
- **Advanced editing capabilities** with bidirectional link support
- **Bulk deletion functionality** with confirmation dialogs

### Changed
- **Bidirectional link creation** improved logic and user interface
- **URL normalization** enhanced to handle more edge cases

### Fixed
- **Edit modal bugs** preventing proper saving of changes
- **Deletion confirmation** UI hierarchy and button styling
- **Storage synchronization** issues across multiple devices

---

## [1.0.0] - 2025-06-30

### Added
- **Initial release** of Jumpmark Dock Chrome Extension
- **Basic jumpmark creation** with title, URL, and icon support
- **Bidirectional linking** - automatic reverse link creation
- **Chrome Sync integration** for cross-device synchronization
- **Badge notifications** showing jumpmark count for current page
- **Smart tab management** - focus existing tabs or create new ones
- **Popup interface** with intuitive jumpmark list and navigation

### Technical
- **Manifest V3 compliance** for modern Chrome extension standards
- **Chrome Storage Sync API** integration with 102KB limit handling
- **Background service worker** for tab monitoring and badge updates
- **Responsive design** with professional UI/UX

---

## Archive

For older versions and detailed development history, see the [Git commit history](https://github.com/maepon/jumpmark-dock/commits/master).

---

**Legend:**
- 🆕 New features
- 🎨 UI/UX improvements  
- 🔧 Technical improvements
- 💡 User experience enhancements
- 🐛 Bug fixes
- 🔒 Security/reliability
- 📦 Build/deployment
- 🏗️ Architecture changes
