// 共通ユーティリティ関数

// URLを正規化（プロトコル、www、末尾スラッシュを削除）
function normalizeUrl(url) {
  if (!url) return '';
  
  try {
    const urlObj = new URL(url);
    let normalized = urlObj.hostname;
    
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
    
    return normalized;
  } catch (error) {
    console.error('URL正規化エラー:', error);
    return url;
  }
}

// 一意なIDを生成
function generateUniqueId() {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${randomStr}`;
}

// URLの検証
function validateUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
}

// 日付をフォーマット
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// HTMLエスケープ
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 指定URLのJumpmarksを取得
async function getJumpmarksForUrl(url) {
  try {
    const result = await chrome.storage.sync.get(['jumpmarks']);
    const allJumpmarks = result.jumpmarks || {};
    return allJumpmarks[url] || [];
  } catch (error) {
    console.error('Jumpmarks取得エラー:', error);
    return [];
  }
}

// 全てのJumpmarksを取得
async function getAllJumpmarks() {
  try {
    const result = await chrome.storage.sync.get(['jumpmarks']);
    const allJumpmarks = result.jumpmarks || {};
    
    // URLごとのJumpmarksを平坦化
    const jumpmarksList = [];
    Object.entries(allJumpmarks).forEach(([sourceUrl, jumpmarks]) => {
      jumpmarks.forEach(jumpmark => {
        jumpmarksList.push({
          ...jumpmark,
          sourceUrl: sourceUrl
        });
      });
    });
    
    return jumpmarksList;
  } catch (error) {
    console.error('全Jumpmarks取得エラー:', error);
    return [];
  }
}

// Jumpmarkを保存
async function saveJumpmark(jumpmarkData) {
  try {
    const result = await chrome.storage.sync.get(['jumpmarks']);
    const jumpmarks = result.jumpmarks || {};
    
    const sourceUrl = normalizeUrl(jumpmarkData.sourceUrl);
    const targetUrl = jumpmarkData.url;
    
    // 新しいJumpmarkを作成
    const newJumpmark = {
      id: generateUniqueId(),
      title: jumpmarkData.title,
      url: targetUrl,
      icon: jumpmarkData.icon || '🔗',
      bidirectional: jumpmarkData.bidirectional || false,
      created: new Date().toISOString()
    };
    
    // ソースURLのJumpmarksに追加
    if (!jumpmarks[sourceUrl]) {
      jumpmarks[sourceUrl] = [];
    }
    jumpmarks[sourceUrl].push(newJumpmark);
    
    // 双方向リンクの場合、逆方向も作成
    if (jumpmarkData.bidirectional) {
      const normalizedTargetUrl = normalizeUrl(targetUrl);
      if (!jumpmarks[normalizedTargetUrl]) {
        jumpmarks[normalizedTargetUrl] = [];
      }
      
      // 逆方向のJumpmarkを作成
      const reverseJumpmark = {
        id: generateUniqueId(),
        title: jumpmarkData.reverseTitle || jumpmarkData.title,
        url: jumpmarkData.sourceUrl,
        icon: jumpmarkData.icon || '🔗',
        bidirectional: false, // 逆方向は自動生成なのでfalse
        created: new Date().toISOString()
      };
      
      jumpmarks[normalizedTargetUrl].push(reverseJumpmark);
    }
    
    await chrome.storage.sync.set({ jumpmarks });
    return newJumpmark;
  } catch (error) {
    console.error('Jumpmark保存エラー:', error);
    throw error;
  }
}

// Jumpmarkを更新
async function updateJumpmark(jumpmarkId, updateData) {
  try {
    const result = await chrome.storage.sync.get(['jumpmarks']);
    const jumpmarks = result.jumpmarks || {};
    
    let found = false;
    let sourceUrl = '';
    
    // Jumpmarkを検索して更新
    Object.entries(jumpmarks).forEach(([url, jumpmarkList]) => {
      const index = jumpmarkList.findIndex(j => j.id === jumpmarkId);
      if (index !== -1) {
        jumpmarkList[index] = { ...jumpmarkList[index], ...updateData };
        found = true;
        sourceUrl = url;
      }
    });
    
    if (!found) {
      throw new Error('Jumpmarkが見つかりません');
    }
    
    await chrome.storage.sync.set({ jumpmarks });
    return true;
  } catch (error) {
    console.error('Jumpmark更新エラー:', error);
    throw error;
  }
}

// Jumpmarkを削除
async function deleteJumpmark(jumpmarkId) {
  try {
    const result = await chrome.storage.sync.get(['jumpmarks']);
    const jumpmarks = result.jumpmarks || {};
    
    let found = false;
    
    // Jumpmarkを検索して削除
    Object.entries(jumpmarks).forEach(([url, jumpmarkList]) => {
      const index = jumpmarkList.findIndex(j => j.id === jumpmarkId);
      if (index !== -1) {
        jumpmarkList.splice(index, 1);
        found = true;
        
        // 空になったURLエントリを削除
        if (jumpmarkList.length === 0) {
          delete jumpmarks[url];
        }
      }
    });
    
    if (!found) {
      throw new Error('Jumpmarkが見つかりません');
    }
    
    await chrome.storage.sync.set({ jumpmarks });
    return true;
  } catch (error) {
    console.error('Jumpmark削除エラー:', error);
    throw error;
  }
}

// 複数のJumpmarksを削除
async function deleteJumpmarks(jumpmarkIds) {
  try {
    const result = await chrome.storage.sync.get(['jumpmarks']);
    const jumpmarks = result.jumpmarks || {};
    
    let deletedCount = 0;
    
    // 各Jumpmarkを削除
    jumpmarkIds.forEach(jumpmarkId => {
      Object.entries(jumpmarks).forEach(([url, jumpmarkList]) => {
        const index = jumpmarkList.findIndex(j => j.id === jumpmarkId);
        if (index !== -1) {
          jumpmarkList.splice(index, 1);
          deletedCount++;
          
          // 空になったURLエントリを削除
          if (jumpmarkList.length === 0) {
            delete jumpmarks[url];
          }
        }
      });
    });
    
    await chrome.storage.sync.set({ jumpmarks });
    return deletedCount;
  } catch (error) {
    console.error('複数Jumpmark削除エラー:', error);
    throw error;
  }
}

// ストレージ統計を取得
async function getStorageStats() {
  try {
    const result = await chrome.storage.sync.get(['jumpmarks']);
    const jumpmarks = result.jumpmarks || {};
    
    let totalJumpmarks = 0;
    let originalJumpmarks = 0;
    let bidirectionalJumpmarks = 0;
    let urlCount = 0;
    
    Object.entries(jumpmarks).forEach(([url, jumpmarkList]) => {
      if (jumpmarkList.length > 0) {
        urlCount++;
        totalJumpmarks += jumpmarkList.length;
        
        jumpmarkList.forEach(jumpmark => {
          if (jumpmark.bidirectional) {
            bidirectionalJumpmarks++;
          } else {
            originalJumpmarks++;
          }
        });
      }
    });
    
    // ストレージ使用量を計算（概算）
    const dataSize = JSON.stringify(jumpmarks).length;
    const storageUsed = Math.round(dataSize / 1024 * 100) / 100; // KB単位
    
    return {
      totalJumpmarks,
      originalJumpmarks,
      bidirectionalJumpmarks,
      urlCount,
      storageUsed
    };
  } catch (error) {
    console.error('ストレージ統計取得エラー:', error);
    return {
      totalJumpmarks: 0,
      originalJumpmarks: 0,
      bidirectionalJumpmarks: 0,
      urlCount: 0,
      storageUsed: 0
    };
  }
}

// デバウンス関数
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// イベントエミッター
class EventEmitter {
  constructor() {
    this.events = {};
  }
  
  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }
  
  off(event, callback) {
    if (this.events[event]) {
      this.events[event] = this.events[event].filter(cb => cb !== callback);
    }
  }
  
  emit(event, data) {
    if (this.events[event]) {
      this.events[event].forEach(callback => callback(data));
    }
  }
}

// グローバルイベントエミッター
const eventEmitter = new EventEmitter();

// 拡張機能のバージョンを取得
function getExtensionVersion() {
  return chrome.runtime.getManifest().version;
}

// 現在のタブ情報を取得
async function getCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  } catch (error) {
    console.error('タブ情報取得エラー:', error);
    return null;
  }
}

// URLに移動（同一URLのタブがあればフォーカス、なければ新タブ作成）
async function navigateToUrl(url) {
  try {
    // 全てのタブを取得
    const tabs = await chrome.tabs.query({});
    
    // 完全に同じURLのタブを探す
    const exactTab = tabs.find(tab => tab.url === url);
    
    if (exactTab) {
      // 同じURLのタブがある場合：フォーカスのみ（リロードしない）
      await chrome.tabs.update(exactTab.id, { active: true });
      await chrome.windows.update(exactTab.windowId, { focused: true });
    } else {
      // 同じURLのタブがない場合：新しいタブを作成
      await chrome.tabs.create({ url: url });
    }
    
    // ポップアップを閉じる
    if (window.close) {
      window.close();
    }
  } catch (error) {
    console.error('URL移動エラー:', error);
  }
}