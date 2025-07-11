# Jumpmark Dock

URLごとに双方向ショートカット（Jumpmark）を設定・管理できるChrome拡張機能です。

## 🚀 機能

### 基本機能
- **双方向リンク**: A→Bを作成すると、B→Aも自動で作成
- **Chrome Sync対応**: 複数デバイス間でJumpmarkを自動同期
- **バッジ表示**: 現在のページにJumpmarkがある場合、拡張機能アイコンに数を表示
- **スマートなタブ管理**: 同じURLのタブがあればフォーカス、なければ新タブを作成
- **編集・削除機能**: 既存のJumpmarkを編集・削除可能
- **直感的なUI**: シンプルで使いやすいポップアップインターフェース

### 🆕 v1.1.0 新機能
- **📤 インポート/エクスポート**: JSON/CSV/HTML形式でデータのバックアップ・復元
- **📁 ドラッグ&ドロップ**: ファイルを直接ドロップしてインポート
- **🔍 重複検出**: インポート時の自動重複チェックとマージオプション
- **🎨 高度な管理UI**: オプションページでの一括操作と検索・フィルタリング
- **🌙 ダークモード**: システム設定に応じた自動テーマ切り替え

## 📦 インストール

### Chrome ウェブストアから（推奨）

[Chrome ウェブストア](https://chromewebstore.google.com/detail/jumpmark-dock/ldodfncboddjjbggcholbmkmjbfjmblh)からインストールできます。

### 開発者向け（パッケージ化されていない拡張機能として）

1. このリポジトリをクローン
   ```bash
   git clone https://github.com/maepon/jumpmark-dock.git
   cd jumpmark-dock
   ```

2. Chromeで `chrome://extensions/` を開く

3. 右上の「デベロッパーモード」をON

4. 「パッケージ化されていない拡張機能を読み込む」をクリック

5. `jumpmark-dock` ディレクトリを選択

## 🎯 使い方

### Jumpmarkの追加

1. 拡張機能アイコンをクリック
2. 「+ Jumpmarkを追加」ボタンをクリック
3. タイトル、URL、アイコンを入力
4. 「双方向リンク」をチェック（推奨）
5. 「保存」をクリック

### Jumpmarkの使用

- 拡張機能アイコンをクリックしてJumpmarkリストを表示
- 移動したいJumpmarkをクリック
- 同じURLのタブがあればフォーカス、なければ新タブで開く

### Jumpmarkの編集・削除

- Jumpmarkアイテムにマウスホバーでボタンが表示
- 「編集」ボタンで内容変更、「削除」ボタンで削除
- 編集時も双方向リンクの設定が可能

### バッジ表示

現在のページにJumpmarkがある場合、拡張機能アイコンに青いバッジで数が表示されます。

### 🆕 インポート/エクスポート（v1.1.0）

#### データのエクスポート
1. 拡張機能アイコンを右クリック → 「オプション」
2. 「インポート/エクスポート」タブを選択
3. エクスポート形式を選択（JSON/CSV/HTML）
4. エクスポート範囲を指定（すべて/選択済み/フィルタ結果）
5. フォーマットボタンをクリックして自動ダウンロード

#### データのインポート
1. オプションページの「インポート/エクスポート」タブ
2. JSONファイルをドラッグ&ドロップ、または「ファイルを選択」
3. インポート設定を確認（既存データとの統合/重複スキップ）
4. プレビューで内容を確認
5. 「インポート実行」をクリック

#### 対応フォーマット
- **JSON**: 完全なデータ形式（推奨）- インポート/エクスポート両対応
- **CSV**: 表計算ソフト用 - エクスポートのみ
- **HTML**: ブラウザ表示用 - エクスポートのみ

## 🏗️ アーキテクチャ

```
jumpmark-dock/
├── manifest.json       # 拡張機能の設定
├── background.js       # バックグラウンドスクリプト（バッジ管理）
├── popup.html         # ポップアップUI
├── popup.js           # ポップアップロジック
├── popup.css          # ポップアップスタイル
├── options.html       # オプションページUI（v1.1.0）
├── options.js         # オプションページロジック（v1.1.0）
├── options.css        # オプションページスタイル（v1.1.0）
├── shared.js          # 共通ユーティリティ関数
├── icons/             # アイコンファイル
├── CLAUDE.md          # Claude Code開発ガイド
└── README.md          # このファイル
```

### 主要コンポーネント

- **popup.js**: 基本的なJumpmarkの管理とUI制御
- **options.js**: 高度な管理機能（インポート/エクスポート、一括操作）
- **background.js**: タブ監視とバッジ更新
- **shared.js**: URL正規化や共通ユーティリティ関数
- **Chrome Storage Sync API**: Jumpmarkデータの永続化と同期

### データ構造

```javascript
{
  "jumpmarks": {
    "example.com/page1": [
      {
        "id": "jm-unique-id-123",
        "title": "関連ページ",
        "url": "https://example.com/page2",
        "icon": "📝",
        "sourceUrl": "example.com/page1",
        "created": "2025-06-30T10:00:00Z"
      }
    ]
  }
}
```

**v1.1.0の変更点**: `bidirectional`フラグを廃止し、`sourceUrl`でURL間の関係を動的に検出する方式に変更。

## 🛠️ 開発

### 前提条件

- Chrome 88以上（Manifest V3対応）
- 開発者モードが有効

### デバッグ

- **ポップアップ**: 拡張機能アイコンを右クリック → 「ポップアップを検証」
- **バックグラウンド**: 拡張機能管理画面で「Service Worker」をクリック
- **ストレージ**: Chrome DevTools → Application → Storage → Extensions

### 実装フェーズ

- ✅ **Phase 1**: 基本機能（追加、表示、移動、双方向リンク、バッジ）
- ✅ **Phase 2**: 編集・削除機能、スマートなタブ管理、Chrome Sync対応
- ✅ **Phase 3**: インポート/エクスポート、高度な管理UI、エラーハンドリング強化

## 🔄 Chrome Sync機能

- **自動同期**: Chrome Syncが有効な場合、Jumpmarkデータが複数デバイス間で自動同期
- **フォールバック**: Chrome Syncが無効な場合、ローカルストレージとして動作
- **制限事項**: 102KB制限、最大512個のJumpmark、4096バイト/アイテム
- **リアルタイム更新**: 他デバイスでの変更が即座に反映

## 🤝 コントリビューション

1. このリポジトリをフォーク
2. 機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📄 ライセンス

このプロジェクトはMITライセンスの下で公開されています。詳細は[LICENSE](LICENSE)ファイルを参照してください。

## 👨‍💻 作者

**Masayuki Maekawa** ([@maepon](https://github.com/maepon))

## 🙏 謝辞

このプロジェクトは[Claude Code](https://claude.ai/code)を使用して開発されました。