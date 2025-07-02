# Jumpmark Dock

URLごとに双方向ショートカット（Jumpmark）を設定・管理できるChrome拡張機能です。

## 🚀 機能

- **双方向リンク**: A→Bを作成すると、B→Aも自動で作成
- **バッジ表示**: 現在のページにJumpmarkがある場合、拡張機能アイコンに数を表示
- **スマートなタブ管理**: 同じURLのタブがあればフォーカス、なければ新タブを作成
- **編集・削除機能**: 既存のJumpmarkを編集・削除可能
- **直感的なUI**: シンプルで使いやすいポップアップインターフェース

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

## 🏗️ アーキテクチャ

```
jumpmark-dock/
├── manifest.json       # 拡張機能の設定
├── background.js       # バックグラウンドスクリプト（バッジ管理）
├── popup.html         # ポップアップUI
├── popup.js           # ポップアップロジック
├── popup.css          # ポップアップスタイル
├── icons/             # アイコンファイル
├── CLAUDE.md          # Claude Code開発ガイド
└── README.md          # このファイル
```

### 主要コンポーネント

- **popup.js**: Jumpmarkの管理とUI制御
- **background.js**: タブ監視とバッジ更新
- **Chrome Storage API**: Jumpmarkデータの永続化

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
        "bidirectional": true,
        "created": "2025-06-30T10:00:00Z"
      }
    ]
  }
}
```

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
- ✅ **Phase 2**: 編集・削除機能、スマートなタブ管理
- ⬜ **Phase 3**: 自動favicon取得、インポート/エクスポート、検索

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