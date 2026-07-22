# 実装計画書 - ワイルドカードURLサポート（高度な設定モード） 【修正版4】

このドキュメントは、Jumpmark Dock にワイルドカード（マッチパターン）URLサポートを追加するための詳細設計および実装計画の修正版です。

---

## 1. 目標 (Goal Description)

現在の Jumpmark Dock は、完全に一致する正規化されたURL間でのみショートカット（ジャンプマーク）の作成に対応しています。しかし、以下のような動的なURLを扱う場合には制限があります。
- GitHubリポジトリ (`https://github.com/owner/repo/*` でコード、Issues、PR、Actionsなどすべてにマッチさせたい)
- ローカル開発環境 (`http://localhost:3000/*` と `http://localhost:8080/*` など、ポート毎にサブルートにマッチさせたい)

今回の変更により、ユーザーは末尾に `*` を含むワイルドカードURLパターンを登録し、マッチするアクティブタブ上でジャンプマークを共通して利用できるようになります。

### 主要な設計判断:
1. **共通ユーティリティ（shared.js）への処理一本化**: 
   `popup.js` や `background.js` に散らばっていた `normalizeUrl` やストレージ操作ロジックを `shared.js` に集約・一元化します。
   - `popup.html` で `shared.js` を先行して読み込みます。
   - `background.js` で `importScripts('shared.js')` を使用し、ロジックを共有します。
2. **ポート番号の保持（hostプロパティの使用）**:
   `normalizeUrl` 内の解析において、`urlObj.hostname` ではなくポート番号を含む **`urlObj.host`** を使用します。これにより、`localhost:3000` と `localhost:8080` などの異なるポート番号を持つローカル開発環境が正しく区別されます。
3. **下位互換性の維持**: ストレージスキーマの大幅な変更（マイグレーション）は行わず、既存のスキーマを拡張します。具体的には、ワイルドカード用のジャンプマークを、そのパターンキー（例: `github.com/owner/repo*`）をそのままストレージキーとして保存し、`isWildcard: true` フラグを付与します。
4. **単方向リンクの強制**: 
   ワイルドカードURLは無限ループや複雑な主従関係の解決を避けるため、**UI制御だけでなく保存ロジック（save/update）の内部でも厳密に単方向リンク（双方向作成を強制的にオフ）に制限**します。
5. **カスケードマッチング**: アクティブタブに対応するジャンプマークをロードする際、以下の順序でマージします。
   - まず、現在のURLに完全一致するキーのデータを取得（O(1)）。
   - 次に、キャッシュされたワイルドカードキーのリストを走査し、現在のURLにマッチするか判定してデータを追加（O(N_wildcard)）。

---

## 2. ユーザーレビューが必要な項目 (User Review Required)

> [!IMPORTANT]
> **共有ファイルの統合 (shared.js)**:
> コードの二重管理を防ぐため、`popup.html` および `background.js` における URL正規化、取得、保存、削除のロジックは、すべて `shared.js` に記述された関数を使用するように変更します。これにより今後の不整合を防ぎます。
>
> **単方向リンクの強制化**:
> `saveJumpmark` / `updateJumpmark` API の内部で、`sourceUrl` が `*` で終わる場合は、どのようなパラメータが送られてきても強制的に `createBidirectional = false` / `bidirectional = false` として処理します。

---

## 3. 入力仕様およびバリデーションルール (Validation Rules)

ワイルドカードパターンとして登録する URL は、以下のルールを厳密に適用します。

1. **末尾アスタリスクのみをワイルドカードとして処理**: 
   - `*` が文字列の末尾にある場合のみ、それをスコープを抽象化するためのワイルドカード（前方一致指定）として認識します。
   - 文字列の中間にある `*` は、エラーにせず、URLの通常の文字（リテラル文字列としての `*`）としてそのまま比較評価します。
2. **最小文字数の制限 / アスタリスクのみの禁止**: 
   - `*` 単体や、プロトコルのみ＋アスタリスク（例: `https://*`）のような広すぎるパターンはパフォーマンスとセキュリティの観点から禁止します（ホスト名部分に最低3文字以上を要求）。
3. **空パターンの禁止**: 空文字列の保存はバリデーションで弾きます。
4. **Query / Hash の自動除去**: `?` や `#` 以降のパラメータは正規化時に強制的に無視・削除されます。

---

## 4. 開発・実装向け補足指示 (Supplemental Instructions)

1. **厳密な型安全性 (Strict Type Safety)**
   - JavaScriptでの開発ですが、JSDoc（`@param`, `@returns` 等）を活用し、共通APIで受け渡されるパラメータやストレージスキーマのプロパティ（`isWildcard?: boolean`, `sourceUrl: string`）の命名が各ファイルで一貫するよう開発します。
2. **ダウンタイムゼロのストレージ一貫性 (Zero-Downtime Storage Consistency)**
   - `urlObj.hostname` から `urlObj.host` に移行するにあたり、標準的なポートなしの本番URL（例: `https://github.com/`）では、ポート表記が省略され `hostname` と全く同じ文字列が得られる `URL.host` の仕様を利用します。これにより、既存の登録済みキーを一切破損せず、そのまま動作し続ける下位互換性を100%維持します。
3. **バックグラウンドキャッシュの同期 (Background Cache Synchronization)**
   - `background.js` にて、ワイルドカードキーを格納する `wildcardKeysCache` の更新は、`chrome.storage.onChanged` 発火時、または拡張機能のロード時に、**ストレージから全ワイルドカードキーを走査してキャッシュを再構築（Rebuild）する方式**をとります。これにより差分更新で発生しがちな「削除・編集されたのにキャッシュが残る」といった不整合バグを完全に排除します。
4. **防御的バリデーション (Defensive Validation)**
   - `shared.js` に共通のバリデーションヘルパーを追加し、ホスト部分の長さチェック（プロトコルおよび末尾 `*` 除去後の文字列が3文字未満の場合にエラー）を強制します。

---

## 5. 提案される変更 (Proposed Changes)

---

### 5.1 共通ユーティリティ (`shared.js`)
URL正規化とマッチング、データの更新ロジックを修正します。

#### [MODIFY] [shared.js](file:///Users/maepon/work/jumpmark-dock/shared.js)
- `normalizeUrl(url)`: 末尾の `*` を一時的に取り除いてから正規化を行い、最後に `*` を再度付加するように変更します。
  - `urlObj.hostname` から **`urlObj.host`** に変更し、ポート番号を保持します。
  - クエリパラメータやハッシュは自動的に破棄します。
- `isUrlMatch(currentUrl, pattern)`: 現在のURLとパターンがマッチするかどうかを判定するヘルパーを追加します。末尾以外の `*` は単なる文字として一致判定を行います。
- `getJumpmarksForUrl(url)`: `allJumpmarks[url]` の取得に加え、ストレージ全体のキーをループ走査して `isUrlMatch` が true になるワイルドカードジャンプマークもマージして返すようにします。
- `updateJumpmark(jumpmarkId, updateData)`: 作成元URL（`sourceUrl`）が変更された場合、古いキーの配列からデータを削除し、新しいキー（例: `github.com/...*`）の配列にデータを移動させる処理を追加します。
- **単方向の強制**: `saveJumpmark`, `updateJumpmark` 内で、対象 URL（`sourceUrl` または `newSourceUrl`）が `*` で終わる場合は、`createBidirectional` などの双方向フラグを強制的に `false` とします。

```javascript
// shared.js 変更イメージ

// normalizeUrlの修正
function normalizeUrl(url) {
  if (!url) return '';
  
  // 末尾のワイルドカードを一時的に分離（中間アスタリスクはそのままリテラルとして残す）
  const hasWildcard = url.endsWith('*');
  let urlToNormalize = hasWildcard ? url.slice(0, -1) : url;
  
  // クエリパラメータやハッシュが含まれている場合は除去
  if (urlToNormalize.includes('?')) {
    urlToNormalize = urlToNormalize.split('?')[0];
  }
  if (urlToNormalize.includes('#')) {
    urlToNormalize = urlToNormalize.split('#')[0];
  }
  
  try {
    // プロトコルがない場合はhttpsを追加
    let normalizedUrl = urlToNormalize;
    if (!urlToNormalize.includes('://')) {
      normalizedUrl = 'https://' + urlToNormalize;
    }
    
    const urlObj = new URL(normalizedUrl);
    // host を使用してポート番号を保持する
    let normalized = urlObj.host;
    
    // www.を削除
    if (normalized.startsWith('www.')) {
      normalized = normalized.substring(4);
    }
    
    // パスを追加（ルートでない場合）
    if (urlObj.pathname !== '/') {
      normalized += urlObj.pathname;
    }
    
    // 末尾のスラッシュを削除
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    
    // ワイルドカードを戻して返す
    return hasWildcard ? normalized + '*' : normalized;
  } catch (error) {
    console.error('URL正規化エラー:', error);
    return url;
  }
}

// パターンマッチ関数
function isUrlMatch(currentUrl, pattern) {
  if (!pattern) return false;
  if (!pattern.endsWith('*')) {
    return currentUrl === pattern;
  }
  
  const basePattern = pattern.slice(0, -1);
  // 中間アスタリスクは単なる文字として前方一致判定される
  return currentUrl === basePattern || currentUrl.startsWith(basePattern + '/');
}
```

---

### 5.2 ポップアップ UI およびロジック (`popup.html`, `popup.js`, `popup.css`)

#### [MODIFY] [popup.html](file:///Users/maepon/work/jumpmark-dock/popup.html)
- `popup.js` の直前で `shared.js` を読み込むようにスクリプトタグを追加します。
- `jumpmarkForm` の「双方向リンク」チェックボックスの下に、アコーディオンで開閉可能な「高度な設定（対象URLのカスタマイズ）」を追加します。

```html
<!-- popup.html フォーム追加部分 -->
<div class="advanced-accordion" id="advancedAccordion">
  <div class="accordion-header" id="accordionHeader">高度な設定（対象URLのカスタマイズ）</div>
  <div class="accordion-content">
    <div class="form-group">
      <label for="sourceUrlPattern">対象とする現在のURL</label>
      <input type="text" id="sourceUrlPattern" placeholder="github.com/owner/repo*">
      <span class="info-text">末尾に「*」を付けるとワイルドカードとして機能します。</span>
      <span id="wildcardNotice" class="warning-text hidden">※ワイルドカード指定時は単方向リンクとなります</span>
    </div>
  </div>
</div>
```

#### [MODIFY] [popup.css](file:///Users/maepon/work/jumpmark-dock/popup.css)
- `.advanced-accordion` や `.accordion-header`、`.accordion-content` のスタイルを追加し、アコーディオンのスライドトランジションと、ダークモード用のカラー定義（アクティブ時の境界線や青色テキストなど）を記述します。

#### [MODIFY] [popup.js](file:///Users/maepon/work/jumpmark-dock/popup.js)
- 重複する `normalizeUrl`, `getJumpmarksForUrl`, `saveJumpmark`, `updateJumpmark`, `deleteJumpmark` のローカル定義を削除し、`shared.js` のグローバル関数を使用するように切り替えます。
- アコーディオンの開閉を制御するイベントリスナーを追加します。
- `sourceUrlPattern` の入力値を監視し、末尾が `*` の場合は「双方向リンク」チェックボックスのチェックを外し、かつ無効化 (`disabled = true`) にし、警告メッセージを表示します。
- **入力バリデーション**:
  - `*` 単体での保存や、最小文字数の制限を下回るパターンでの保存時にアラートを表示します。

---

### 5.3 管理オプション画面 UI およびロジック (`options.html`, `options.js`)

#### [MODIFY] [options.html](file:///Users/maepon/work/jumpmark-dock/options.html)
- 編集モーダル内の「作成元URL」の表示エリアを、静的な `div` から編集可能な入力フォームに変更します。
  `<input type="text" id="editSourceUrl" name="sourceUrl">`
- ポップアップと同様に、警告テキストエリアを追加します。

#### [MODIFY] [options.js](file:///Users/maepon/work/jumpmark-dock/options.js)
- `createJumpmarkRow`: テーブル内の「タイプ」列で、`isWildcard` が true のデータに対し `[ワイルドカード]` バッジ（特別なスタイル `.type-wildcard`）を表示するようにします。
- `editJumpmark`: モーダルを開いた際、`editSourceUrl` に該当するジャンプマークの `sourceUrl` を初期値として値代入します。
- `editSourceUrl` の監視: ポップアップ同様に入力値が `*` で終わる場合、「戻りリンクを作成」を無効化かつチェックオフにする連動ロジックを追加します。
- `handleEditFormSubmit`: 
  - バリデーションチェックを行い、エラー時はモーダル内にメッセージを表示します。
  - 変更された `sourceUrl` パターンをキーとして、正しくキー変更（データの移管）を適用して保存します。
- **インポート / エクスポート**: 
  - `isWildcard` フィールドを JSON / CSV / HTML 出力に反映させます。
  - インポート時の重複スキップ判定においても、`sourceUrl`（ワイルドカードを含むキー）を考慮した突合を行います。

---

### 5.4 バックグラウンド処理 (`background.js`)

#### [MODIFY] [background.js](file:///Users/maepon/work/jumpmark-dock/background.js)
- スクリプトの最上部で `importScripts('shared.js')` を呼び出し、共通関数（`normalizeUrl`, `isUrlMatch` など）を共有します。
- **ワイルドカードキャッシュの導入 (パフォーマンス対応)**:
  - 起動時および `chrome.storage.onChanged` 発生時に、ストレージからワイルドカードパターンキー（末尾が `*` のキー）だけを抽出してメモリ内の配列 `wildcardKeysCache` にキャッシュします。
  - タブの更新に伴う `getJumpmarkCountForUrl(url)` では、ストレージ全体の走査は行わず、`wildcardKeysCache` と完全一致キー（O(1)）のみを走査してバッジの数を集計します。

---

## 6. 検証計画 (Verification Plan)

現在、拡張機能は直接Chromeに読み込んで動作確認するため、以下の手順に沿って手動で検証を行います。

### 手動動作テスト手順
1. **拡張機能の再読み込み**: `chrome://extensions/` にて、「パッケージ化されていない拡張機能を読み込む」でプロジェクトを選択し、最新のコードをロードします。
2. **ワイルドカードジャンプマークの作成**:
   - 任意のGitHub Issueページ（例: `https://github.com/maepon/jumpmark-dock/issues/1`）を開きます。
   - 拡張機能ポップアップから「Jumpmarkを追加」をクリック。
   - 「高度な設定」を開き、対象URLを `https://github.com/maepon/jumpmark-dock*`（末尾に `*` を追加）に編集します。
   - 「双方向リンク」チェックボックスが自動的に無効化され、チェックが外れ、「※ワイルドカード指定時は単方向リンクとなります」という警告が表示されることを確認します。
   - 任意のタイトルを入力し、保存します。
3. **マッチングおよびバッジ数の検証**:
   - 同じリポジトリの異なるページ（例: `https://github.com/maepon/jumpmark-dock/actions` や `/pulls`）に移動します。
   - 拡張機能アイコンの青色バッジに「1」と表示されていることを確認します（キャッシュに基づく正確な集計）。
   - ポップアップを開き、先ほど作成したワイルドカードジャンプマークが表示されていること、そこから対象ページへ正しくナビゲーションできることを確認します。
4. **中間アスタリスク（リテラル一致）の検証**:
   - パスにアスタリスクが含まれる特殊な検証ページ（例: `https://example.com/foo*bar/page`）で、`https://example.com/foo*bar*`（中間に `*` を含み、末尾にも `*` があるもの）として登録します。
   - `https://example.com/foo-bar/page`（アスタリスクをハイフンに変えたページ）に移動した際、バッジが「非表示（マッチしない）」であることを確認します。
   - 再び `https://example.com/foo*bar/page` に戻り、正しくマッチ（バッジ表示）されることを確認します。
5. **ポート番号（localhost:3000 等）の検証**:
   - ポート付きローカル開発環境（例: `http://localhost:3000/app`）で、`http://localhost:3000*` のワイルドカードジャンプマークを作成します。
   - `http://localhost:8080/app` に移動し、バッジが表示されない（別ポートとして正しく区別されている）ことを確認します。
   - `http://localhost:3000/settings` に移動し、バッジが正しく表示されることを確認します。
6. **不正なワイルドカードのバリデーション検証**:
   - 対象URLに `*` 単体や `https://*`（広すぎる）などを入力した際、バリデーションエラーが発生して保存されないことを確認します。
7. **管理画面 (Options Page) での表示と編集**:
   - 拡張機能のオプション画面を開きます。
   - ジャンプマーク一覧テーブルで、作成した項目に紫/グレー of `[ワイルドカード]` バッジが表示されていることを確認します。
   - 「編集」ボタンを押し、作成元URLの入力エリアから `*` を削除した際に、「戻りリンクを作成」が再度選択可能になることを確認します。
   - 再び保存し、意図通りにデータが保存されているかを確認します。
8. **削除の検証**:
   - ポップアップまたは管理画面から該当項目を削除し、対象リポジトリのどのサブルートに行ってもバッジやポップアップから消去されていることを確認します。
