// URLまたはパターン文字列から各種構成要素を安全に解析する共通ヘルパー
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

// URLを正規化（プロトコル、www、末尾スラッシュを削除）
function normalizeUrl(url) {
  const parsed = parseUrlPattern(url);
  if (!parsed.success) return url;
  return parsed.isWildcard ? parsed.normalizedWithoutWildcard + '*' : parsed.normalizedWithoutWildcard;
}

// 現在のURLがパターンに適合するかチェック
function isUrlMatch(currentUrl, pattern) {
  if (!pattern) return false;
  if (!pattern.endsWith('*')) {
    return currentUrl === pattern;
  }
  
  const basePattern = pattern.slice(0, -1);
  // 中間アスタリスクは単なる文字として前方一致判定される
  return currentUrl === basePattern || currentUrl.startsWith(basePattern + '/');
}

// プロトコルを保持・判定して完全なURL文字列を生成
function formatUrlWithProtocol(sourceUrlNormalized, rawInputUrl = '', oldPartnerUrl = '') {
  if (!sourceUrlNormalized) return '';
  if (sourceUrlNormalized.includes('://')) return sourceUrlNormalized;
  
  // 1. 明示的な http:// の検出（入力生URL または 既存パートナーURL）
  if ((rawInputUrl && rawInputUrl.startsWith('http://')) || 
      (oldPartnerUrl && oldPartnerUrl.startsWith('http://'))) {
    return 'http://' + sourceUrlNormalized;
  }
  
  // 2. 明示的な https:// の検出
  if ((rawInputUrl && rawInputUrl.startsWith('https://')) || 
      (oldPartnerUrl && oldPartnerUrl.startsWith('https://'))) {
    return 'https://' + sourceUrlNormalized;
  }
  
  // 3. URL API のみを使用して hostname を安全に判定（split(':') は使用しない）
  const parsed = parseUrlPattern(sourceUrlNormalized);
  const hostname = parsed.hostname;
  
  const isLocalHost = hostname === 'localhost' || 
                      hostname === '127.0.0.1' || 
                      hostname === '[::1]' || 
                      hostname === '::1' ||
                      hostname.startsWith('[fe80:') ||
                      hostname.startsWith('[fc') ||
                      hostname.startsWith('[fd') ||
                      hostname.endsWith('.local') ||
                      hostname.endsWith('.test') ||
                      hostname.endsWith('.localhost');
                      
  if (isLocalHost) {
    return 'http://' + sourceUrlNormalized; // ローカル環境は既定 http://
  }
  
  // 4. 一般的なドメインの既定フォールバックは https://
  return 'https://' + sourceUrlNormalized;
}

// ソースURLパターンのバリデーション
function validateSourceUrlPattern(pattern) {
  if (!pattern || !pattern.trim()) {
    return { valid: false, message: 'URLパターンを入力してください' };
  }
  
  const parsed = parseUrlPattern(pattern);
  if (!parsed.host || parsed.host.length < 3) {
    return { valid: false, message: '対象URLのホスト名部分は3文字以上必要です' };
  }
  
  return { valid: true };
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
    
    let matchedJumpmarks = [];
    for (const pattern in allJumpmarks) {
      if (isUrlMatch(url, pattern)) {
        allJumpmarks[pattern].forEach(jm => {
          matchedJumpmarks.push({
            ...jm,
            sourceUrl: pattern
          });
        });
      }
    }
    return matchedJumpmarks;
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
    const isWildcard = sourceUrl.endsWith('*');
    
    // 新しいJumpmarkを作成
    const newJumpmark = {
      id: generateUniqueId(),
      title: jumpmarkData.title,
      url: targetUrl,
      icon: jumpmarkData.icon || '🔗',
      sourceUrl: sourceUrl,
      created: new Date().toISOString()
    };
    if (isWildcard) {
      newJumpmark.isWildcard = true;
    }
    
    // ソースURLのJumpmarksに追加
    if (!jumpmarks[sourceUrl]) {
      jumpmarks[sourceUrl] = [];
    }
    jumpmarks[sourceUrl].push(newJumpmark);
    
    // 双方向リンクの場合、逆方向も作成（ワイルドカードでない場合のみ）
    if (jumpmarkData.createBidirectional && !isWildcard) {
      const normalizedTargetUrl = normalizeUrl(targetUrl);
      if (!jumpmarks[normalizedTargetUrl]) {
        jumpmarks[normalizedTargetUrl] = [];
      }
      
      // 逆方向のJumpmarkを作成
      const reverseUrl = formatUrlWithProtocol(sourceUrl, jumpmarkData.sourceUrl);
      const reverseJumpmark = {
        id: generateUniqueId(),
        title: jumpmarkData.reverseTitle || `← ${jumpmarkData.title}`,
        url: reverseUrl,
        icon: jumpmarkData.icon || '🔗',
        sourceUrl: normalizedTargetUrl,
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

// Jumpmarkを更新（キー移動および逆方向エントリの整合性を維持）
async function updateJumpmark(jumpmarkId, updateData) {
  try {
    const result = await chrome.storage.sync.get(['jumpmarks']);
    const jumpmarks = result.jumpmarks || {};
    
    let foundJumpmark = null;
    let oldSourceUrl = null;
    
    // 編集対象のJumpmarkを検索
    for (const [url, jumpmarkList] of Object.entries(jumpmarks)) {
      const index = jumpmarkList.findIndex(j => j.id === jumpmarkId);
      if (index !== -1) {
        foundJumpmark = jumpmarkList[index];
        oldSourceUrl = url;
        break;
      }
    }
    
    if (!foundJumpmark) {
      throw new Error('Jumpmarkが見つかりません');
    }
    
    // 更新前の状態に基づく古い双方向パートナーを検索
    let oldPartner = null;
    let oldPartnerSourceUrl = null;
    for (const [url, jumpmarkList] of Object.entries(jumpmarks)) {
      const partnerIndex = jumpmarkList.findIndex(j => isBidirectionalPair(foundJumpmark, j));
      if (partnerIndex !== -1) {
        oldPartner = jumpmarkList[partnerIndex];
        oldPartnerSourceUrl = url;
        break;
      }
    }
    
    // 古いキーから編集対象を削除
    const oldList = jumpmarks[oldSourceUrl];
    if (oldList) {
      const idx = oldList.findIndex(j => j.id === jumpmarkId);
      if (idx !== -1) oldList.splice(idx, 1);
      if (oldList.length === 0) delete jumpmarks[oldSourceUrl];
    }
    
    // 古いパートナーが存在した場合は一度ストレージから削除（後で必要に応じて再作成/更新）
    if (oldPartner && oldPartnerSourceUrl) {
      const partnerList = jumpmarks[oldPartnerSourceUrl];
      if (partnerList) {
        const pIdx = partnerList.findIndex(j => j.id === oldPartner.id);
        if (pIdx !== -1) partnerList.splice(pIdx, 1);
        if (partnerList.length === 0) delete jumpmarks[oldPartnerSourceUrl];
      }
    }
    
    // 新しいsourceUrlとtargetUrlを決定
    const newSourceUrl = updateData.sourceUrl ? normalizeUrl(updateData.sourceUrl) : oldSourceUrl;
    const newTargetUrl = updateData.url || foundJumpmark.url;
    const isWildcard = newSourceUrl.endsWith('*');
    
    // 双方向リンクを作成・更新するか判定
    const createBidirectional = !isWildcard && (
      updateData.createBidirectional !== undefined ? !!updateData.createBidirectional :
      (updateData.createReverse !== undefined ? !!updateData.createReverse : !!oldPartner)
    );
    
    // 更新データを適用
    const updatedJumpmark = { 
      ...foundJumpmark, 
      ...updateData,
      sourceUrl: newSourceUrl,
      url: newTargetUrl
    };
    
    // 一時フラグを除去
    delete updatedJumpmark.createBidirectional;
    delete updatedJumpmark.createReverse;
    
    if (isWildcard) {
      updatedJumpmark.isWildcard = true;
    } else {
      delete updatedJumpmark.isWildcard;
    }
    
    // 新しいキーのリストに追加
    if (!jumpmarks[newSourceUrl]) {
      jumpmarks[newSourceUrl] = [];
    }
    jumpmarks[newSourceUrl].push(updatedJumpmark);
    
    // 双方向リンクの場合、逆方向エントリを作成・更新
    if (createBidirectional) {
      const normalizedTargetUrl = normalizeUrl(newTargetUrl);
      if (!jumpmarks[normalizedTargetUrl]) {
        jumpmarks[normalizedTargetUrl] = [];
      }
      
      const rawInputSource = updateData.sourceUrl || '';
      const oldPartnerUrl = oldPartner ? oldPartner.url : '';
      const reverseUrl = formatUrlWithProtocol(newSourceUrl, rawInputSource, oldPartnerUrl);
      const reverseJumpmark = {
        id: oldPartner ? oldPartner.id : generateUniqueId(),
        title: updateData.reverseTitle || (oldPartner ? oldPartner.title : `← ${updatedJumpmark.title}`),
        url: reverseUrl,
        icon: updatedJumpmark.icon || '🔗',
        sourceUrl: normalizedTargetUrl,
        created: oldPartner ? oldPartner.created : new Date().toISOString()
      };
      
      jumpmarks[normalizedTargetUrl].push(reverseJumpmark);
    }
    
    await chrome.storage.sync.set({ jumpmarks });
    return true;
  } catch (error) {
    console.error('Jumpmark更新エラー:', error);
    throw error;
  }
}

// Jumpmarkを削除（単体）
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

// 双方向ペアを削除
async function deleteBidirectionalPair(jumpmarkId, partnerId) {
  try {
    const result = await chrome.storage.sync.get(['jumpmarks']);
    const jumpmarks = result.jumpmarks || {};
    
    let deletedCount = 0;
    
    // 両方のJumpmarkを削除
    [jumpmarkId, partnerId].forEach(id => {
      Object.entries(jumpmarks).forEach(([url, jumpmarkList]) => {
        const index = jumpmarkList.findIndex(j => j.id === id);
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
    console.error('双方向ペア削除エラー:', error);
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

// 双方向リンクのペア判定
function isBidirectionalPair(jumpmarkA, jumpmarkB) {
  if (!jumpmarkA || !jumpmarkB || jumpmarkA.id === jumpmarkB.id) {
    return false;
  }
  
  const urlA = normalizeUrl(jumpmarkA.url);
  const urlB = normalizeUrl(jumpmarkB.url);
  const sourceA = jumpmarkA.sourceUrl;
  const sourceB = jumpmarkB.sourceUrl;
  
  return urlA === sourceB && urlB === sourceA;
}

// 指定jumpmarkと対になる双方向リンクを検索
async function findBidirectionalPartner(targetJumpmark) {
  try {
    const allJumpmarks = await getAllJumpmarks();
    return allJumpmarks.find(jm => isBidirectionalPair(targetJumpmark, jm));
  } catch (error) {
    console.error('双方向パートナー検索エラー:', error);
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