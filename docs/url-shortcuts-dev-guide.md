# Jumpmark Dock - 開発ガイド

## プロジェクト概要

URLごとに双方向ショートカット（Jumpmark）を設定・管理できるChrome拡張機能「Jumpmark Dock」の開発ガイドです。Claude Codeでスムーズに開発を始められるよう、必要な情報をまとめています。

## 基本仕様

### 機能要件
- 任意のWebページに対してJumpmark（ショートカット）を設定可能
- 双方向リンク機能（A→B、B→Aの相互リンク）
- 現在のページにJumpmarkがある場合、拡張機能アイコンにバッジ表示
- popup.htmlベースのシンプルなUI

### 技術スタック
- Chrome Extension Manifest V3
- Vanilla JavaScript（フレームワークなし）
- Chrome Storage API（データ保存）

## ディレクトリ構造

```
jumpmark-dock/
├── manifest.json          # 拡張機能の設定ファイル
├── background.js          # バックグラウンドスクリプト（バッジ管理）
├── popup.html            # ポップアップUI
├── popup.js              # ポップアップのロジック
├── popup.css             # ポップアップのスタイル
└── icons/                # アイコンファイル
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

## ファイル別実装内容

### 1. manifest.json

```json
{
  "manifest_version": 3,
  "name": "Jumpmark Dock",
  "version": "1.0.0",
  "description": "Jump between related pages with bidirectional shortcuts",
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    },
    "default_title": "Jumpmark Dock"
  },
  "permissions": [
    "storage",
    "tabs"
  ],
  "host_permissions": [
    "<all_urls>"
  ]
}
```

### 2. background.js - 主要機能

```javascript
// URLの正規化関数
function normalizeUrl(url) {
  // プロトコル、www、末尾のスラッシュを統一
  // 例: https://www.example.com/ → example.com
}

// Jumpmark取得
async function getJumpmarksForUrl(url) {
  // chrome.storage.syncからデータ取得
  // 正規化したURLで検索
}

// バッジ更新
async function updateBadgeForTab(tabId, url) {
  // Jumpmark数を取得
  // バッジにテキストと色を設定
}

// タブイベントリスナー
chrome.tabs.onUpdated.addListener()
chrome.tabs.onActivated.addListener()
chrome.storage.onChanged.addListener()
```

### 3. popup.html - UI構造

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Jumpmark Dock</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <!-- メイン画面 -->
  <div id="mainView">
    <div class="header">
      <h1 class="app-title">Jumpmark Dock</h1>
      <div class="current-url"></div>
    </div>
    <div class="jumpmarks-container">
      <!-- Jumpmarkリスト or 空状態 -->
    </div>
    <div class="footer">
      <button id="addButton">Add Jumpmark</button>
    </div>
  </div>

  <!-- 追加フォーム -->
  <div id="formView" class="hidden">
    <!-- フォーム要素 -->
  </div>
  
  <script src="popup.js"></script>
</body>
</html>
```

### 4. popup.js - ロジック実装

```javascript
// 現在のタブ情報取得
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  return tab;
}

// Jumpmark表示
async function displayJumpmarks() {
  // 現在のURLのJumpmarkを取得
  // DOMに反映
}

// Jumpmark保存
async function saveJumpmark(fromUrl, jumpmarkData) {
  // 双方向リンクの処理を含む
  // chrome.storageに保存
}

// イベントリスナー設定
document.addEventListener('DOMContentLoaded', init);
```

## データ構造

```javascript
// Chrome Storage内のデータ形式
{
  "jumpmarks": {
    "example.com/page1": [
      {
        "id": "jm-unique-id-123",
        "title": "関連ページ",
        "url": "https://example.com/page2",
        "icon": "📝",
        "bidirectional": true,
        "created": "2025-06-30T10:00:00Z"
      }
    ],
    "example.com/page2": [
      {
        "id": "jm-unique-id-124",
        "title": "← 関連ページ",
        "url": "https://example.com/page1",
        "icon": "📝",
        "bidirectional": false,  // 逆方向なのでfalse
        "created": "2025-06-30T10:00:00Z"
      }
    ]
  }
}
```

## Claude Codeでの開発手順

### 1. プロジェクト初期化

```bash
# プロジェクトディレクトリ作成
mkdir jumpmark-dock
cd jumpmark-dock

# 必要なディレクトリ作成
mkdir icons

# 基本ファイル作成
touch manifest.json background.js popup.html popup.js popup.css
```

### 2. アイコン準備

アイコンは以下のサイズが必要：
- 16x16px（ツールバー用）
- 48x48px（拡張機能管理画面用）
- 128x128px（Chrome ウェブストア用）

簡易的には、船のアンカー⚓や船着き場🚢をモチーフにしたアイコンが「Dock」のイメージに合います。

### 3. 開発時のテスト方法

1. Chrome で `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」をON
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `jumpmark-dock` ディレクトリを選択

### 4. デバッグ方法

- **ポップアップのデバッグ**: 拡張機能アイコンを右クリック → 「ポップアップを検証」
- **background.jsのデバッグ**: 拡張機能管理画面で「Service Worker」をクリック
- **console.log()**: 各所に配置してChrome DevToolsで確認

## 実装の優先順位

### Phase 1: MVP（最初に実装）
1. ✅ manifest.json作成
2. ✅ 基本的なpopup.html/CSS
3. ✅ 現在のURL取得・表示
4. ✅ Jumpmarkの追加・保存
5. ✅ Jumpmarkの表示
6. ✅ Jumpmarkのクリックで遷移

### Phase 2: 基本機能完成
1. ⬜ バッジ表示機能（background.js）
2. ⬜ 双方向リンク実装
3. ⬜ Jumpmarkの編集・削除
4. ⬜ URLの正規化処理

### Phase 3: 改善
1. ⬜ アイコンの自動取得（favicon）
2. ⬜ エラーハンドリング
3. ⬜ データのインポート/エクスポート
4. ⬜ Jumpmarkの検索機能

## コード規約

- 変数名: camelCase（例: `jumpmarkData`）
- 関数名: 動詞で始まるcamelCase（例: `saveJumpmark`）
- 非同期関数: async/await使用
- エラーハンドリング: try-catch使用
- コメント: 日本語OK、重要な処理には必ず記載

## UI/UXガイドライン

### カラースキーム
- プライマリカラー: #4285f4（Googleブルー）
- 背景: #ffffff
- テキスト: #202124
- サブテキスト: #5f6368

### 用語統一
- ショートカット → **Jumpmark**
- 追加 → **Add Jumpmark**
- 削除 → **Remove**
- 編集 → **Edit**

## トラブルシューティング

### よくある問題

1. **拡張機能が読み込まれない**
   - manifest.jsonの構文エラーをチェック
   - 必要なファイルがすべて存在するか確認

2. **popup.jsが動作しない**
   - popup.htmlで正しく読み込まれているか確認
   - DOMContentLoadedイベント内で初期化しているか

3. **chrome.storageが動作しない**
   - manifest.jsonにstorage権限があるか確認
   - async/awaitを正しく使用しているか

4. **バッジが表示されない**
   - background.jsが正しく登録されているか
   - tabIdを正しく指定しているか

## 参考リンク

- [Chrome Extensions Documentation](https://developer.chrome.com/docs/extensions/mv3/)
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/reference/)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)

## 次のステップ

このドキュメントを参考に、Claude Codeで以下の順番で実装を進めてください：

1. 基本ファイルの作成
2. manifest.jsonの設定（Jumpmark Dock用）
3. popup.htmlの基本UI作成
4. popup.jsで現在のURL取得
5. Jumpmark追加機能
6. chrome.storageへの保存

「Jumpmark Dock」として、URLをつなぐ船着き場のような拡張機能を作りましょう！

質問があれば、具体的なコード例を示しながらサポートします。