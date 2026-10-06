
# Jumpmark Dock

Jumpmark Dock は、**Scoped Bookmark**（スコープ付きブックマーク）を実現する Chrome 拡張機能です。

普通のブックマークは、どのページを開いていても同じ一覧が表示されます。Jumpmark Dock で作るブックマーク（Jumpmark）は、作成元のページ（スコープ）にひも付き、そのページを開いたときだけ表示されます。「このページを見ているときは、いつもあのページに行きたい」という移動を、ブックマークバーを埋めずに用意できます。

- [Chrome ウェブストア](https://chromewebstore.google.com/detail/jumpmark-dock/ldodfncboddjjbggcholbmkmjbfjmblh)
- 考え方の紹介: [ブックマークにスコープを ― Scoped Bookmark という考え方](https://maepon.blog/about-scoped-bookmark/)

## 機能

- **ページごとの Jumpmark**: 今開いているページに Jumpmark を作成し、そのページを開いたときだけポップアップに表示します
- **双方向リンク**: A→B を作るときに、B→A の戻りの Jumpmark も一緒に作れます（初期状態でオン）。戻りのタイトルは `← <作成元ページのタイトル>` になります
- **ワイルドカード**: 作成元URLの末尾に `*` を付けると、そのパス配下の全ページで表示される Jumpmark を作れます
- **バッジ表示**: 今のページに Jumpmark があると、拡張機能アイコンに件数を表示します
- **既存タブへの切り替え**: 移動先と同じページのタブがすでに開いていればそのタブに切り替え、なければ新しいタブで開きます
- **開いているタブから入力**: 追加フォームで開いているタブを選ぶと、タイトルとURLが入力されます
- **管理画面（オプションページ）**: すべての Jumpmark の検索・並べ替え・絞り込み（単独／双方向／ワイルドカード）、編集、まとめて削除
- **インポート／エクスポート**: JSON でのバックアップと復元、CSV・HTML への書き出し
- **Chrome Sync による同期**: 同じ Google アカウントでログインしている Chrome の間で同期します
- **日本語・英語の UI**: Chrome の表示言語に合わせて切り替わります。ダークモードにも対応しています

バージョンごとの変更は [CHANGELOG.md](CHANGELOG.md) にあります。

## インストール

[Chrome ウェブストア](https://chromewebstore.google.com/detail/jumpmark-dock/ldodfncboddjjbggcholbmkmjbfjmblh)からインストールしてください。

開発中の版を試す場合は、パッケージ化されていない拡張機能として読み込みます。

1. このリポジトリをクローンする
   ```bash
   git clone https://github.com/maepon/jumpmark-dock.git
   ```
2. Chrome で `chrome://extensions/` を開き、右上の「デベロッパー モード」をオンにする
3. 「パッケージ化されていない拡張機能を読み込む」から、クローンした `jumpmark-dock` ディレクトリを選ぶ

## 使い方

### Jumpmark を追加する

1. Jumpmark を置きたいページで、拡張機能アイコンをクリックする
2. 「+ Jumpmarkを追加」をクリックする
3. 移動先のタイトルとURLを入力する
   - 「開いているタブから選ぶ」を開いてタブを選ぶと、タイトルとURLが入力されます（一覧は開いたときにだけ読み込みます）
   - 新しく作る Jumpmark のアイコンは `🔖` になります。編集で変更できます
4. 移動先からも戻れるようにするなら、「双方向リンク」をオンのままにする
5. 「保存」をクリックする

### ワイルドカードで複数のページに表示する

作成元URLの末尾に `*` を付けると、そのパス配下のどのページを開いていても同じ Jumpmark が表示されます。

1. 追加フォームの「高度な設定（対象URLのカスタマイズ）」を開く
2. 「対象とする現在のURL」に、末尾に `*` を付けたURLを入力する（例: `github.com/owner/repo*`）
3. タイトルとURLを入力して「保存」をクリックする

| 作成元URL | 表示されるページ | 表示されないページ |
|---|---|---|
| `github.com/owner/repo*` | `github.com/owner/repo`、`github.com/owner/repo/issues/1` | `github.com/owner/repo-other` |
| `example.com/docs*` | `example.com/docs`、`www.example.com/docs/guide/intro` | `example.com/blog`、`docs.example.com` |

- 一致はパスの区切り（`/`）単位で判定します。`*` は末尾にだけ使え、途中の `*` は普通の文字として扱います
- サブドメインには一致しません（`www.` の有無は同じものとして扱います）
- ワイルドカードを使った Jumpmark は単方向です（戻りの Jumpmark は作られません）

### Jumpmark で移動する

拡張機能アイコンをクリックして、一覧から Jumpmark をクリックします。移動先と同じページのタブがあればそのタブに切り替え、なければ新しいタブで開きます。

同じページかどうかは、末尾の `/`、大文字小文字、既定のポート（`:443` / `:80`）の違いを無視して判定します。`#` 以降は、Jumpmark のURLに `#` があるときだけ区別します。クエリ、スキーム、`www.` の違いは別のページとして扱います。

### 編集・削除する

- ポップアップでは、Jumpmark にマウスを重ねると「編集」「削除」ボタンが表示されます
- オプションページ（拡張機能アイコンを右クリック →「オプション」）では、すべての Jumpmark を一覧で編集・削除できます。対になる戻りの Jumpmark があるときは、両方を削除するか選べます

### インポート／エクスポート

オプションページの「インポート/エクスポート」タブで行います。

- **エクスポート**: 範囲（すべて／選択した Jumpmark／今の絞り込み結果）を選び、形式のボタンをクリックするとファイルがダウンロードされます
- **インポート**: JSON ファイルをドラッグ&ドロップするか「ファイルを選択」で読み込み、設定（既存データと統合するか、重複をスキップするか）とプレビューを確認して「インポート実行」をクリックします

| 形式 | 用途 | インポート |
|---|---|---|
| JSON | すべての項目を含むバックアップ（推奨） | できる |
| CSV | 表計算アプリで見る | できない |
| HTML | ブラウザで見る（`http`/`https` 以外のURLはリンクにせず文字として表示） | できない |

## 同期と保存容量

データは `chrome.storage.sync` に保存されます。Chrome の同期が有効なら、同じ Google アカウントの Chrome の間で同期されます（反映のタイミングは Chrome の同期によります）。同期が無効でも、そのブラウザの中では普通に使えます。

`chrome.storage.sync` には、全体 102,400 バイト・1項目 8,192 バイト・最大 512 項目という上限があります。Jumpmark Dock はデータを作成元URLのハッシュで最大 64 個の項目（と、入りきらない分の続きの項目）に分けて保存しており、全体で約 100KB（Jumpmark 1件あたり約 8KB まで）使えます。

- オプションページに、上限に対する使用量を表示します
- 上限に近づくと、追加フォームに警告を表示します
- 上限を超える保存（追加・編集・インポート）は、理由を表示して行いません
- v2.3.0 以前の形式のデータ（`jumpmarks` 項目）は、古いバージョンとの互換のため残しています。その分も使用量に含まれます

## 開発

拡張機能そのものにビルドの手順はありません。ソースファイルを直接編集し、`chrome://extensions/` で再読み込みして確認します。

```bash
npm ci                 # 開発用の依存（Prettier）をインストール
npm test               # テスト（Node の組み込みテストランナー）
npm run format:check   # 整形のチェック（npm run format で整形）
```

PR では、GitHub Actions で `npm test` と `npm run format:check` が実行されます。

### ファイル構成

```
jumpmark-dock/
├── manifest.json        # 拡張機能の設定
├── background.js        # Service Worker（タブの監視とバッジの更新）
├── popup.html/js/css    # ポップアップ
├── options.html/js/css  # オプションページ（管理、インポート／エクスポート）
├── shared.js            # URL の正規化・照合、ストレージの読み書きなどの共通処理
├── i18n.js              # 静的な DOM に翻訳メッセージを当てる
├── _locales/            # chrome.i18n のメッセージ（ja / en）
├── icons/               # アイコン
├── test/                # テスト
├── docs/                # 設計メモ、ストア掲載文、作業の引き継ぎ記録
├── ai-flow/             # AI による開発フローのツール（別リポジトリから git subtree で取り込み）
├── .ai-flow/            # ai-flow のこのリポジトリ用の設定
└── .github/workflows/   # CI とパッケージ作成
```

`chrome.storage` へのアクセスはすべて `shared.js` の `readJumpmarksStore` / `writeJumpmarksStore` / `onJumpmarksChanged` を通します。開発の詳しい方針は [CLAUDE.md](CLAUDE.md)、進行中の作業は [docs/work-session-handoff.md](docs/work-session-handoff.md) にあります。

### データ構造

`readJumpmarksStore()` は、正規化した作成元URLごとに Jumpmark の配列を返します。

```javascript
{
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
```

- URL の正規化では、プロトコル、`www.`、末尾の `/`、クエリ、`#` 以降を取り除きます
- 双方向の関係はフラグでは持たず、`sourceUrl` と `url` が互いに一致するかで判定します
- ワイルドカードの Jumpmark には `isWildcard: true` が付きます

`chrome.storage.sync` には、これを作成元URLのハッシュ（FNV-1a）で次の項目に分けて保存します。

- `jm:<番号>`（番号は 0〜63）: バケットの先頭項目。値は `{ "d": { 作成元URL: [Jumpmark, ...] } }`
- `jm:<番号>:<i>`（i = 1, 2, …）: 1項目 8,192 バイトに入りきらない分の続きの項目。このとき先頭項目に `n`（項目数）と `r`（内容のハッシュ）が付きます
- `jm:meta`: `{ "v": 2, "legacyIds": [...] }`。旧形式から取り込み済みの Jumpmark の id
- `jumpmarks`: v2.3.0 以前の形式（全データを1項目に保存）。互換のため残しており、書き換えも削除もしません

### デバッグ

- **ポップアップ**: 拡張機能アイコンを右クリック →「ポップアップを検証」
- **Service Worker**: `chrome://extensions/` の Jumpmark Dock の「Service Worker」をクリック
- **ストレージ**: DevTools の Application → Storage → Extension storage

## コントリビューション

Issue や Pull Request を歓迎します。PR を送る前に `npm test` と `npm run format:check` が通ることを確認してください。

脆弱性は公開の Issue ではなく、[SECURITY.md](SECURITY.md) の手順で報告してください。

## ライセンス

MIT ライセンスです。詳しくは [LICENSE](LICENSE) を参照してください。

## 作者

Masayuki Maekawa（[@maepon](https://github.com/maepon)）
