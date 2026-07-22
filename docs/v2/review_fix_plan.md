# レビュー指摘事項に対する修正方針書 【修正版12】

## 概要
コードレビューで指摘された以下の課題について、修正方針と具体的な修正手順・明確なフォールバック仕様を定義します。

1. `validateSourceUrlPattern()` における中間 `*` の誤拒否問題
2. MV3 サービスワーカー休止後の `wildcardKeysCache` 欠落問題
3. `options.js` 編集時の双方向パートナー消失問題
4. `popup.js` 編集時の初期化とワイルドカード遷移限定によるチェック状態復元問題 【補強】
5. HTTP プロトコルの保持と IPv6 リンクローカル / ULA / ポート付き `.local` ドメインの完全なホスト判定
6. `options.js` の URL 編集時における双方向ペア誤消滅問題 & `sourceUrl` 変更時の再判定対応

---

## 1. 指摘1 (High): `validateSourceUrlPattern()` における中間 `*` の誤拒否

### 課題内容
- `shared.js` の `validateSourceUrlPattern()` 内で `asterisks > 1` または `(asterisks === 1 && !pattern.endsWith('*'))` の場合にエラーを返すロジックが存在する。
- これにより、計画書に明示されている「文字列の中間にある `*` はリテラル（通常の文字）としてそのまま評価・保存する」仕様に反し、`https://example.com/foo*bar*` や `https://example.com/foo*bar` 等のパターンがバリデーションエラーとなり保存できない。

### 修正方針
1. **アスタリスク個数・位置制限の撤廃**:
   - `validateSourceUrlPattern()` からアスタリスクの個数や末尾限定をチェックするロジック（`asterisks > 1` 等）を削除します。
2. **バリデーションロジックの整理**:
   - 以下の条件のみを評価します。
     1. 空文字列または空白のみのチェック
     2. プロトコル（`://` 以降）および末尾のワイルドカード `*` を取り除いたクリーン文字列の作成
     3. クリーン文字列からホスト名部分（最初の `/` までの文字列）を切り出し、ホスト名の長さが3文字未満（例: `*`, `https://*`, `https://a*`）の場合はエラーとする。
   - これにより、`https://example.com/foo*bar*` や `https://example.com/foo*bar` などの中間アスタリスクを含むパターンが正常に許可されます。

---

## 2. 指摘2 (High): MV3 サービスワーカー休止後の `wildcardKeysCache` 欠落問題

### 課題内容
- Manifest V3 の Service Worker は一定時間でアイドル状態になりメモリが破棄（終了）されます。
- `wildcardKeysCache` は `onInstalled` / `onStartup` / `storage.onChanged` でのみ再構築されるため、サービスワーカー再起動後の `tabs.onActivated` や `tabs.onUpdated` 発生時、`wildcardKeysCache` が空配列（`[]`）のまま `getJumpmarkCountForUrl()` が実行されます。
- その結果、ワイルドカードジャンプマークのバッジ数が一時的に 0 件 / 表示欠落となります。

### 修正方針
1. **キャッシュ再構築保証・リカバリ機構 (`ensureWildcardCache`) の導入**:
   - バックグラウンドスクリプトに、キャッシュ構築状態を Promise で保持・管理する `ensureWildcardCache()` 関数を追加します。
   - **失敗時のリカバリ設計**: `rebuildWildcardCache()` が例外・拒否（reject）された場合は `catch` ブロックで `wildcardCachePromise = null;` にリセットし、次回呼び出し時に再試行可能にします。
   ```javascript
   let wildcardCachePromise = null;

   function ensureWildcardCache() {
     if (!wildcardCachePromise) {
       wildcardCachePromise = rebuildWildcardCache().catch(err => {
         wildcardCachePromise = null;
         console.error('ワイルドカードキャッシュ構築エラー:', err);
       });
     }
     return wildcardCachePromise;
   }
   ```
2. **呼び出し箇所での `await ensureWildcardCache()` 徹底**:
   - `getJumpmarkCountForUrl()` の先頭で `await ensureWildcardCache();` を実行し、キャッシュが確実に構築された状態でマッチング走査を行うように変更します。
3. **ストレージ変更時のキャッシュ更新**:
   - `storage.onChanged` 発火時は `wildcardCachePromise = rebuildWildcardCache();` をセットして再ロードします（エラー時は同様に `catch` で null 化）。
4. **トップレベルでの先行読み込み**:
   - `background.js` のスクリプト評価時（トップレベル）にも `ensureWildcardCache()` 呼び出しを行います。

---

## 3. 指摘3 (Medium / High): 双方向 Jumpmark 編集時の逆方向エントリ残存問題 (`shared.js`)

### 課題内容
- 既存の双方向 Jumpmark を編集して `url` や `sourceUrl` を変更した際、またはワイルドカード指定や単方向への変更を行った際、以前の対となる逆方向エントリ（`oldPartner`）がストレージに削除されずに残り続けてしまう問題。

### 修正方針
1. **`shared.js` の `updateJumpmark` 内における整合性維持処理の一本化**:
   - 変更がストレージに適用される前に、編集前の `foundJumpmark` と対になっていた古い双方向パートナー（`oldPartner`）を `isBidirectionalPair()` により全ストレージから検索・特定します。
   - `oldPartner` が存在する場合、編集処理の中で古いストレージキーから `oldPartner` を確実に削除（クリーンアップ）します。
   - `updateData.createBidirectional` が明示されていない場合（`undefined`）は、既存の `oldPartner` が存在していれば維持（`createBidirectional = true`）します。

---

## 4. 指摘4 (High): ポップアップ編集時の初期化とワイルドカード遷移限定による状態復元ロジック (`popup.js`) 【補強】

### 課題内容
- 既存のワイルドカードリンク（初期状態で `*` が付与されているデータ）を編集モーダルで開いた場合や、入力中に手動でチェックを外した際、状態変数 `wasWildcard` や `savedCheckedBeforeWildcard` が正確に初期化されていないと、`*` を削除した際の復元挙動が不正確になる問題。

### 修正方針
1. **モーダル初期化時の初期状態取り込み (`wasWildcard`, `savedCheckedBeforeWildcard`)**:
   - **新規作成モーダル表示時 (`showFormView`)**:
     - `wasWildcard = false;`
     - `savedCheckedBeforeWildcard = true;` （新規作成時の既定チェック状態）
   - **編集モーダル表示時 (`editJumpmark`)**:
     - `const partner = await findBidirectionalPartner(jumpmark);` により初期双方向状態を判定。
     - `savedCheckedBeforeWildcard = !!partner;`
     - 初期 `sourceUrlPattern` が `*` で終わっているか判定し `wasWildcard = sourceUrlPattern.value.endsWith('*');` にセット。
   - **モーダル終了時 (`showMainView`)**:
     - 変数をリセット。

2. **遷移（Transition）イベント限定の復元制御**:
   - **非ワイルドカード ➔ ワイルドカード遷移時（ユーザーが末尾に `*` を入力した瞬間）**:
     - 直前のチェック状態を `savedCheckedBeforeWildcard` に保持し、`checked = false`, `disabled = true` に設定します。
   - **ワイルドカード ➔ 非ワイルドカード遷移時（ユーザーが末尾の `*` を削除した瞬間）**:
     - `disabled = false` に戻し、チェックボックスを `savedCheckedBeforeWildcard` の初期/退避状態に復元します。
   - **通常の非ワイルドカード入力時（通常URLを入力・編集している間）**:
     - チェックボックスの `checked` 状態には**一切触れず**、ユーザーが手動で選択・変更したチェック状態をそのまま尊重・保持します。

   ```javascript
   let wasWildcard = false;
   let savedCheckedBeforeWildcard = true;

   // 編集開始時
   async function editJumpmark(jumpmark) {
     editingJumpmark = jumpmark;
     const partner = await findBidirectionalPartner(jumpmark);
     const isInitialBidirectional = !!partner;
     
     sourceUrlPattern.value = jumpmark.sourceUrl || currentUrl;
     const initialIsWildcard = sourceUrlPattern.value.endsWith('*');
     
     savedCheckedBeforeWildcard = isInitialBidirectional;
     wasWildcard = initialIsWildcard;
     
     if (initialIsWildcard) {
       document.getElementById('bidirectional').checked = false;
       document.getElementById('bidirectional').disabled = true;
       wildcardNotice.classList.remove('hidden');
     } else {
       document.getElementById('bidirectional').checked = isInitialBidirectional;
       document.getElementById('bidirectional').disabled = false;
       wildcardNotice.classList.add('hidden');
     }
     ...
   }

   // リアルタイム入力監視
   sourceUrlPattern.addEventListener('input', () => {
     const val = sourceUrlPattern.value.trim();
     const isWildcard = val.endsWith('*');
     const bidirectionalCheckbox = document.getElementById('bidirectional');
     
     if (isWildcard) {
       if (!wasWildcard) {
         savedCheckedBeforeWildcard = bidirectionalCheckbox.checked;
       }
       bidirectionalCheckbox.checked = false;
       bidirectionalCheckbox.disabled = true;
       wildcardNotice.classList.remove('hidden');
       wasWildcard = true;
     } else {
       bidirectionalCheckbox.disabled = false;
       wildcardNotice.classList.add('hidden');
       
       if (wasWildcard) {
         bidirectionalCheckbox.checked = savedCheckedBeforeWildcard;
       }
       wasWildcard = false;
     }
   });
   ```

---

## 5. 指摘5 (High): HTTP プロトコルの保持と IPv6 リンクローカル / ULA アドレス判定 (`shared.js`)

### 課題内容
- IPv6 のリンクローカルアドレス（`[fe80::1]:8080`）や ULA アドレス（`[fc00::1]`, `[fd00::1]`）が `isLocalHost` の判定条件（`[::1]` のみ）に含まれておらず、既定の `https://` に倒れて逆方向 URL が破損する問題。

### 修正方針
1. **IPv6 リンクローカル / ULA アドレスプレフィックスの追加**:
   - `hostname.startsWith('[fe80:')`, `hostname.startsWith('[fc')`, `hostname.startsWith('[fd')` を `isLocalHost` の判定条件に追加します。
   - コロン分割 (`split(':')`) は全廃し、標準 `new URL()` のみで safe パースします。

---

## 6. 指摘6 (Medium): `options.js` の URL・作成元URL変更時における双方向判定の正確化 (`options.js`)

### 課題内容
- `updateBidirectionalCheckboxState()` 内で作成される `currentJumpmark` が `url: editUrl.value.trim()` のみ差し替えており、編集中の `editSourceUrl`（作成元URL）の入力変更値を反映していなかった問題。

### 修正方針
1. `updateBidirectionalCheckboxState()` にて `url` と `sourceUrl`（`newSourcePattern`）の両方の変更値を反映して動的判定を行ないます。

---

## 7. 変更対象ファイル一覧

- [shared.js](file:///Users/maepon/work/jumpmark-dock/shared.js):
  - `validateSourceUrlPattern()` の中間 `*` 許可対応
  - `updateJumpmark()` の古い双方向パートナーの自動クリーンアップ & 更新・維持ロジック拡張
  - `URL` API のみに一元化した IPv6・ポート付きドメイン対応の `formatUrlWithProtocol`
- [popup.js](file:///Users/maepon/work/jumpmark-dock/popup.js):
  - モーダル初期化時 (`editJumpmark` / `showFormView`) の初期状態取り込みおよび `wasWildcard` 遷移フラグ制御による完璧な状態復元
- [options.js](file:///Users/maepon/work/jumpmark-dock/options.js):
  - `updateBidirectionalCheckboxState()` の `sourceUrl` 反映対応
- [background.js](file:///Users/maepon/work/jumpmark-dock/background.js):
  - `ensureWildcardCache()` 導入
- [docs/v2/review_fix_plan.md](file:///Users/maepon/work/jumpmark-dock/docs/v2/review_fix_plan.md):
  - 変更方針書（本ドキュメント）
