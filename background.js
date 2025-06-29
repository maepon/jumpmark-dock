// バックグラウンドスクリプト - Jumpmark Dock

// URLの正規化関数（popup.jsと同じロジック）
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    let normalized = urlObj.hostname;
    
    // wwwを除去
    if (normalized.startsWith('www.')) {
      normalized = normalized.substring(4);
    }
    
    // パスを追加（ルート以外の場合）
    if (urlObj.pathname !== '/') {
      normalized += urlObj.pathname;
    }
    
    // 末尾のスラッシュを除去
    normalized = normalized.replace(/\/$/, '');
    
    return normalized;
  } catch (error) {
    console.error('URL正規化エラー:', error);
    return url;
  }
}

// 指定URLのJumpmark数を取得
async function getJumpmarkCountForUrl(url) {
  try {
    const normalizedUrl = normalizeUrl(url);
    const result = await chrome.storage.sync.get(['jumpmarks']);
    const allJumpmarks = result.jumpmarks || {};
    const jumpmarks = allJumpmarks[normalizedUrl] || [];
    return jumpmarks.length;
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
    // Jumpmarksが変更された場合、全てのタブのバッジを更新
    await updateAllTabsBadges();
  }
});

// 拡張機能インストール時の初期化
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Jumpmark Dock がインストールされました');
  
  // 初期バッジ設定
  await updateAllTabsBadges();
});

// 拡張機能起動時の初期化
chrome.runtime.onStartup.addListener(async () => {
  console.log('Jumpmark Dock が起動しました');
  
  // 起動時バッジ設定
  await updateAllTabsBadges();
});