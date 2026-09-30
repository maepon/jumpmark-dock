# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- `docs/privacy-policy.md` の tabs 権限・収集しないデータの記述を、実際の挙動（バッジ更新のための全タブの URL 照合、既存タブへの切り替え、タブ一覧機能）に合わせて改訂した
- `docs/chrome-store-description.md` の tabs 権限の説明を同様に改訂した

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
