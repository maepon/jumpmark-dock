# リファクタリング計画書 (v2)

手動テストおよびコードレビューを通過したワイルドカード機能について、保守性と堅牢性をさらに向上させるためのリファクタリング計画を定義します。

---

## 1. shared.js: URL / パターン前処理の共通一元化

### 現状と課題
- 現在、URL からのプロトコル剥離、ホスト名/ポート番号の抽出、ワイルドカード除去などの前処理が `normalizeUrl()`, `formatUrlWithProtocol()`, `validateSourceUrlPattern()` の3つの関数に個別に実装され、分散しています。
- 将来的に URL の仕様や対応するプロトコル、ポート番号の扱いを変更する際、複数箇所を同期して修正する必要があり、バグの温床になりやすい状態です。

### 解決策
- URL およびワイルドカード付きパターン文字列を一括で解析して各パーツを分離・正規化する共通ヘルパー `parseUrlPattern()` を `shared.js` に導入し、既存の3関数をこの共通パーサーに依存する形に集約します。
- **失敗時の挙動維持（互換性担保）**: 既存の `normalizeUrl()` はパースに失敗した場合に入力文字列をそのまま返却する（原文保持）仕様です。共通ヘルパーに `success: boolean` フラグを持たせ、呼び出し元で失敗を検知して元の値をそのまま返せるようにします。

### 具体的な設計 (`shared.js`)

#### 共通パーサー関数の追加
```javascript
/**
 * URLまたはパターン文字列から各種構成要素を安全に解析する共通ヘルパー
 * @param {string} urlLikeStr 解析対象のURLまたはパターン
 * @returns {{
 *   success: boolean,            // 解析が成功したかどうか
 *   protocol: string,            // 'http' | 'https' | '' (元の文字列に指定されていたプロトコル)
 *   hostname: string,            // 小文字のホスト名 (例: 'localhost', '[::1]', 'github.com')
 *   port: string,                // ポート番号 (例: '3000', '')
 *   host: string,                // host (例: 'localhost:3000', 'github.com')
 *   pathname: string,            // パス (例: '/owner/repo', '')
 *   isWildcard: boolean,         // 末尾にアスタリスクがあるか
 *   normalizedWithoutWildcard: string // ワイルドカード無しの正規化済みURL (例: 'localhost:3000/app')
 * }}
 */
function parseUrlPattern(urlLikeStr) {
  if (!urlLikeStr) {
    return { success: false, protocol: '', hostname: '', port: '', host: '', pathname: '', isWildcard: false, normalizedWithoutWildcard: '' };
  }
  
  const trimmed = urlLikeStr.trim();
  const isWildcard = trimmed.endsWith('*');
  let cleanUrl = isWildcard ? trimmed.slice(0, -1) : trimmed;
  
  // クエリとハッシュの除去
  if (cleanUrl.includes('?')) cleanUrl = cleanUrl.split('?')[0];
  if (cleanUrl.includes('#')) cleanUrl = cleanUrl.split('#')[0];
  
  // プロトコルの抽出
  let protocol = '';
  let urlToParse = cleanUrl;
  if (cleanUrl.includes('://')) {
    const parts = cleanUrl.split('://');
    protocol = parts[0].toLowerCase();
    urlToParse = cleanUrl;
  } else {
    // URL API用に一時補完
    urlToParse = 'https://' + cleanUrl;
  }
  
  try {
    const urlObj = new URL(urlToParse);
    const hostname = urlObj.hostname.toLowerCase();
    const port = urlObj.port;
    let host = urlObj.host.toLowerCase();
    
    // www. の除去
    if (host.startsWith('www.')) {
      host = host.substring(4);
    }
    
    let pathname = urlObj.pathname;
    if (pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    
    const normalizedWithoutWildcard = host + pathname;
    
    return {
      success: true,
      protocol: cleanUrl.includes('://') ? protocol : '',
      hostname,
      port,
      host,
      pathname,
      isWildcard,
      normalizedWithoutWildcard
    };
  } catch (error) {
    console.error('URL解析エラー:', error, urlLikeStr);
    return {
      success: false,
      protocol: '',
      hostname: '',
      port: '',
      host: '',
      pathname: '',
      isWildcard,
      normalizedWithoutWildcard: cleanUrl
    };
  }
}
```

#### 各既存関数の書き換え方針
- **`normalizeUrl(url)`**:
  `parsed.success` が `false` の場合は、従来どおり引数の `url` をそのまま返却して完全な原文保持を担保します。
  ```javascript
  function normalizeUrl(url) {
    const parsed = parseUrlPattern(url);
    if (!parsed.success) return url;
    return parsed.isWildcard ? parsed.normalizedWithoutWildcard + '*' : parsed.normalizedWithoutWildcard;
  }
  ```
- **`formatUrlWithProtocol(sourceUrlNormalized, rawInputUrl, oldPartnerUrl)`**:
  内部の `try-catch` による個別 `new URL()` 解析部分を `parseUrlPattern(sourceUrlNormalized)` に差し替え。
- **`validateSourceUrlPattern(pattern)`**:
  内部の文字列切り出し・分割ロジックをすべて排除し、`parseUrlPattern(pattern)` から取得した `parsed.host.length < 3` の判定に一元化。

---

## 2. popup.js: 状態計算と DOM 状態反映 (UI反映) の分離

### 現状と課題
- ワイルドカードのトグルや状態初期化の処理が `showFormView()`, `showMainView()`, `editJumpmark()`, `input` ハンドラに散在しています。
- 単一の関数内で「状態変数 (`wasWildcard`, `savedCheckedBeforeWildcard`) の更新」と「DOM要素の操作（チェックボックスや注意表示の切り替え）」が混在して行われているため、更新順序 of 依存関係がわかりづらく、見通しが良くありません。

### 解決策
- 状態変更を行わず与えられた値に基づいて DOM 更新を行う UI 反映関数 `updateWildcardUi(isWildcard, savedChecked, updateCheckedState)` を定義し、状態変数の更新（状態遷移）は各ハンドラ側で独立して行う設計にします。
- **通常入力時の checked 保持**: 通常入力中（ワイルドカード遷移が発生しない間）にユーザーが手動でチェックを外した状態を上書きしないよう、`updateCheckedState` オプションを指定可能にし、不要なチェック状態の巻き戻しを完全に防止します。

### 具体的な設計 (`popup.js`)

#### 共通UI反映関数の追加
```javascript
/**
 * 双方向チェックボックスと注意表示の DOM 状態を一括更新する (UI反映関数)
 * @param {boolean} isWildcard ワイルドカードパターンかどうか
 * @param {boolean} savedChecked 退避されているチェックボックスの checked 状態
 * @param {boolean} updateCheckedState checked 状態を更新するかどうか (通常入力時は false を指定し、ユーザーの手動選択を保持)
 */
function updateWildcardUi(isWildcard, savedChecked, updateCheckedState = true) {
  const bidirectionalCheckbox = document.getElementById('bidirectional');
  const wildcardNotice = document.getElementById('wildcardNotice');
  
  if (isWildcard) {
    bidirectionalCheckbox.checked = false;
    bidirectionalCheckbox.disabled = true;
    wildcardNotice.classList.remove('hidden');
  } else {
    bidirectionalCheckbox.disabled = false;
    wildcardNotice.classList.add('hidden');
    if (updateCheckedState) {
      bidirectionalCheckbox.checked = savedChecked;
    }
  }
}

/**
 * 編集セッションの状態（編集対象データ、退避フラグ等）をすべて初期値に戻す (状態操作)
 */
function resetEditSessionState() {
  editingJumpmark = null;
  editingHasInitialPartner = false;
  wasWildcard = false;
  savedCheckedBeforeWildcard = true;
}
```

#### 各箇所の書き換え方針 (状態遷移とUI更新の分離)
- **`showFormView()`**:
  ```javascript
  function showFormView() {
    jumpmarkForm.reset();
    resetEditSessionState();
    updateWildcardUi(false, true, true); // 新規作成時は checked=true で初期化
    advancedAccordion.classList.remove('open');
    if (currentTab) {
      sourceUrlPattern.value = currentTab.url;
    }
  }
  ```
- **`showMainView()`**:
  ```javascript
  function showMainView() {
    formView.classList.add('hidden');
    mainView.classList.remove('hidden');
    resetEditSessionState();
  }
  ```
- **`editJumpmark(jumpmark)`**:
  ```javascript
  async function editJumpmark(jumpmark) {
    editingJumpmark = jumpmark;
    // ...フォームへの既存データ設定...
    
    sourceUrlPattern.value = jumpmark.sourceUrl || currentUrl;
    const initialIsWildcard = sourceUrlPattern.value.endsWith('*');
    
    const partner = await findBidirectionalPartner(jumpmark);
    editingHasInitialPartner = !!partner;
    
    // 状態変数の計算・保持
    wasWildcard = initialIsWildcard;
    savedCheckedBeforeWildcard = editingHasInitialPartner;
    
    if (initialIsWildcard) {
      advancedAccordion.classList.add('open');
    } else {
      advancedAccordion.classList.remove('open');
    }
    
    // UI反映
    updateWildcardUi(initialIsWildcard, editingHasInitialPartner, true);
    
    mainView.classList.add('hidden');
    formView.classList.remove('hidden');
  }
  ```
- **`sourceUrlPattern` の `input` イベントリスナー**:
  状態変数の遷移条件（ワイルドカードの追加/削除の境界）を検出し、通常の文字入力中には `updateCheckedState = false` とすることで checked 状態への介入を防止します。
  ```javascript
  sourceUrlPattern.addEventListener('input', () => {
    const val = sourceUrlPattern.value.trim();
    const isWildcard = val.endsWith('*');
    const bidirectionalCheckbox = document.getElementById('bidirectional');
    
    // 状態遷移の判定
    let shouldUpdateChecked = false;
    if (isWildcard) {
      if (!wasWildcard) {
        savedCheckedBeforeWildcard = bidirectionalCheckbox.checked;
      }
      wasWildcard = true;
      shouldUpdateChecked = true; // ワイルドカード設定時は一律 checked=false とする
    } else {
      if (wasWildcard) {
        shouldUpdateChecked = true; // ワイルドカード ➔ 通常 URL 遷移時のみ退避状態を復元する
      }
      wasWildcard = false;
    }
    
    // UIへの反映 (通常入力中は shouldUpdateChecked=false となり、手動選択されたチェック状態を上書きしません)
    updateWildcardUi(isWildcard, savedCheckedBeforeWildcard, shouldUpdateChecked);
  });
  ```
