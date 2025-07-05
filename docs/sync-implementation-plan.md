# Chrome Sync実装方針ドキュメント

## 概要
Jumpmark Dockに既存のChrome Syncストレージを活用した同期機能の実装方針を記載します。

## 現状分析（修正版）

### 既存実装の状況
- **重要**: コードベースは既に`chrome.storage.sync`を使用している
- **問題**: manifest.jsonには`"storage"`権限が追加済みだが、実際にはChrome Syncが機能していない可能性がある

### 確認事項
1. **manifest.json**: `"storage"`権限が追加済み（line 25）
2. **background.js**: `chrome.storage.sync`を使用（line 33, 107）
3. **popup.js**: `chrome.storage.sync`を使用（line 106, 222, 235, 246, 285, 297, 360）

### 技術的検証結果
- **Chrome Sync vs Local Storage**: 
  - `chrome.storage.sync`: 102KB制限、512アイテム、4096Bytes/アイテム
  - `chrome.storage.local`: 5.2MB制限、アイテム数制限なし
- **権限要件**: `"storage"`権限で両方のAPIが利用可能
- **同期動作**: Chrome Syncが無効でも`chrome.storage.sync`は`chrome.storage.local`として動作

## 実装方針

### 1. 現在の状況
既存コードは`chrome.storage.sync`を使用しているが、実際の同期動作は以下に依存：
- ユーザーのChrome Sync設定
- Googleアカウントログイン状態
- 拡張機能の同期設定

### 2. 同期機能の改善が必要な理由
- 現在のコードは同期APIを使用しているが、ユーザーには同期機能として明示されていない
- エラーハンドリングが不十分
- 同期状態の可視化がない

## 技術仕様

### ストレージ構造
```javascript
{
  "jumpmarks": {
    "normalized-url": [
      {
        "id": "unique-id",
        "title": "Display name",
        "url": "target-url",
        "icon": "emoji",
        "bidirectional": true/false,
        "created": "ISO-timestamp"
      }
    ]
  }
}
```

### 同期の制限事項
- **容量制限**: 100KB（Chrome Sync制限）
- **アイテム数**: 512個まで
- **同期頻度**: Chromeの内部スケジュール依存

## 検証項目

### 1. 基本動作確認
- [ ] 異なるデバイス間でのJumpmarks同期
- [ ] 新規作成時の即座同期
- [ ] 編集・削除時の即座同期
- [ ] 双方向リンクの同期

### 2. エラーハンドリング
- [ ] 同期失敗時の処理
- [ ] 容量制限エラー時の処理
- [ ] ネットワークエラー時の処理

### 3. パフォーマンス
- [ ] 大量データ時の同期パフォーマンス
- [ ] 同期頻度の最適化

## 結論（修正版）

**現在の実装は`chrome.storage.sync`を使用しているが、実際の同期動作は不明確**

### 実装すべき改善項目（優先度順）

#### 高優先度
1. **同期状態の可視化**
   - Chrome Syncが有効かどうかの表示
   - 同期エラーの通知
   - 最後の同期時刻の表示

2. **エラーハンドリングの強化**
   - 容量制限エラーの処理
   - 同期失敗時のフォールバック
   - ネットワークエラーの処理

#### 中優先度
3. **容量制限の監視機能**
   - 使用量の表示
   - 制限近接時の警告
   - データ削除の提案

4. **同期設定の管理**
   - 同期の有効/無効切り替え
   - 同期範囲の設定
   - 手動同期の実行

#### 低優先度
5. **データの最適化**
   - 大きなデータの圧縮
   - 不要データの自動削除
   - 同期頻度の最適化

現在は`chrome.storage.sync`を使用しているが、ユーザーには同期機能として認識されていない可能性が高い。