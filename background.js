// バックグラウンドスクリプト - Jumpmark Dock

// 共通ユーティリティをインポート
importScripts('shared.js');

// ワイルドカードキーのメモリキャッシュ
let wildcardKeysCache = [];
let wildcardCachePromise = null;

// キャッシュの構築を保証する関数（エラー時は null に戻して次回リトライ可能にする）
function ensureWildcardCache() {
  if (!wildcardCachePromise) {
    wildcardCachePromise = rebuildWildcardCache().catch(err => {
      wildcardCachePromise = null;
      console.error('ワイルドカードキャッシュ構築エラー:', err);
    });
  }
  return wildcardCachePromise;
}

// キャッシュを再構築する関数
async function rebuildWildcardCache() {
  try {
    const result = await chrome.storage.sync.get(['jumpmarks']);
    const allJumpmarks = result.jumpmarks || {};
    
    // 末尾が * で終わるキー（ワイルドカードキー）だけを抽出してキャッシュ
    wildcardKeysCache = Object.keys(allJumpmarks).filter(key => key.endsWith('*'));
    console.log('ワイルドカードキャッシュを再構築しました:', wildcardKeysCache);
  } catch (error) {
    console.error('ワイルドカードキャッシュ再構築エラー:', error);
    wildcardKeysCache = [];
    throw error;
  }
}

// スクリプト読み込み（Service Worker 起動）時に先行ロード
ensureWildcardCache();

async function getJumpmarkCountForUrl(url) {
  try {
    // キャッシュ構築完了を保証
    await ensureWildcardCache();
    
    const normalizedUrl = normalizeUrl(url);
    const result = await chrome.storage.sync.get(['jumpmarks']);
    const allJumpmarks = result.jumpmarks || {};
    
    let count = 0;
    
    // 1. 完全一致
    if (allJumpmarks[normalizedUrl]) {
      count += allJumpmarks[normalizedUrl].length;
    }
    
    // 2. キャッシュされたワイルドカードキーのみを走査してマッチング
    for (const pattern of wildcardKeysCache) {
      if (pattern !== normalizedUrl && isUrlMatch(normalizedUrl, pattern)) {
        count += allJumpmarks[pattern].length;
      }
    }
    
    return count;
  } catch (error) {
    console.error('Jumpmark数取得エラー:', error);
    return 0;
  }
}

// バッジを更新
async function updateBadgeForTab(tabId, url) {
  try {
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
      // Chrome内部ページではバッジを表示しない
      await chrome.action.setBadgeText({ tabId: tabId, text: '' });
      return;
    }
    
    const count = await getJumpmarkCountForUrl(url);
    
    if (count > 0) {
      await chrome.action.setBadgeText({
        tabId: tabId,
        text: count.toString()
      });
      await chrome.action.setBadgeBackgroundColor({
        tabId: tabId,
        color: '#4285f4'
      });
    } else {
      await chrome.action.setBadgeText({ tabId: tabId, text: '' });
    }
  } catch (error) {
    console.error('バッジ更新エラー:', error);
  }
}

// 全てのタブのバッジを更新
async function updateAllTabsBadges() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.url) {
        await updateBadgeForTab(tab.id, tab.url);
      }
    }
  } catch (error) {
    console.error('全タブバッジ更新エラー:', error);
  }
}

// タブが更新された時のイベントリスナー
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // URLが変更された場合、またはページの読み込みが完了した場合
  if (changeInfo.url || changeInfo.status === 'complete') {
    await updateBadgeForTab(tabId, tab.url);
  }
});

// アクティブタブが変更された時のイベントリスナー
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      await updateBadgeForTab(activeInfo.tabId, tab.url);
    }
  } catch (error) {
    console.error('アクティブタブ変更エラー:', error);
  }
});

// ストレージが変更された時のイベントリスナー
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'sync' && changes.jumpmarks) {
    // キャッシュを再構築
    wildcardCachePromise = rebuildWildcardCache().catch(err => {
      wildcardCachePromise = null;
      console.error('ワイルドカードキャッシュ再構築エラー:', err);
    });
    await wildcardCachePromise;
    // Jumpmarksが変更された場合、全てのタブのバッジを更新
    await updateAllTabsBadges();
  }
});

// 拡張機能インストール時の初期化
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Jumpmark Dock がインストールされました');
  
  // キャッシュを初期再構築
  await rebuildWildcardCache();
  // 初期バッジ設定
  await updateAllTabsBadges();
});

// 拡張機能起動時の初期化
chrome.runtime.onStartup.addListener(async () => {
  console.log('Jumpmark Dock が起動しました');
  
  // キャッシュを初期再構築
  await rebuildWildcardCache();
  // 起動時バッジ設定
  await updateAllTabsBadges();
});