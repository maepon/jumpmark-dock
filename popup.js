// グローバル変数
let currentTab = null;
let currentUrl = '';
let editingJumpmark = null;

// DOM要素
const mainView = document.getElementById('mainView');
const formView = document.getElementById('formView');
const currentUrlDiv = document.getElementById('currentUrl');
const jumpmarksContainer = document.getElementById('jumpmarksContainer');
const emptyState = document.getElementById('emptyState');
const addButton = document.getElementById('addButton');
const backButton = document.getElementById('backButton');
const cancelButton = document.getElementById('cancelButton');
const jumpmarkForm = document.getElementById('jumpmarkForm');
const formTitle = document.getElementById('formTitle');

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await init();
  } catch (error) {
    console.error('初期化エラー:', error);
  }
});

// メイン初期化関数
async function init() {
  currentTab = await getCurrentTab();
  if (currentTab) {
    currentUrl = normalizeUrl(currentTab.url);
    displayCurrentUrl();
    await displayJumpmarks();
  }
  
  setupEventListeners();
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

// URLの正規化
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

// 現在のURLを表示
function displayCurrentUrl() {
  if (currentTab) {
    const displayUrl = currentTab.url.length > 50 
      ? currentTab.url.substring(0, 47) + '...'
      : currentTab.url;
    currentUrlDiv.textContent = displayUrl;
  }
}

// Jumpmarksを表示
async function displayJumpmarks() {
  try {
    const jumpmarks = await getJumpmarksForUrl(currentUrl);
    
    if (jumpmarks.length === 0) {
      showEmptyState();
    } else {
      showJumpmarksList(jumpmarks);
    }
  } catch (error) {
    console.error('Jumpmarks表示エラー:', error);
    showEmptyState();
  }
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

// 空状態を表示
function showEmptyState() {
  jumpmarksContainer.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">⚓</div>
      <p>このページにはまだJumpmarkがありません</p>
      <p class="empty-subtitle">関連ページへのショートカットを追加しましょう</p>
    </div>
  `;
}

// Jumpmarksリストを表示
function showJumpmarksList(jumpmarks) {
  jumpmarksContainer.innerHTML = '';
  
  jumpmarks.forEach(jumpmark => {
    const jumpmarkElement = createJumpmarkElement(jumpmark);
    jumpmarksContainer.appendChild(jumpmarkElement);
  });
}

// Jumpmark要素を作成
function createJumpmarkElement(jumpmark) {
  const div = document.createElement('div');
  div.className = 'jumpmark-item';
  div.innerHTML = `
    <div class="jumpmark-icon">${jumpmark.icon || '🔗'}</div>
    <div class="jumpmark-content">
      <div class="jumpmark-title">${escapeHtml(jumpmark.title)}</div>
      <div class="jumpmark-url">${escapeHtml(jumpmark.url)}</div>
    </div>
    <div class="jumpmark-actions">
      <button class="edit-button" data-id="${jumpmark.id}">編集</button>
      <button class="delete-button" data-id="${jumpmark.id}">削除</button>
    </div>
  `;
  
  // クリックイベント（ボタン以外）
  div.addEventListener('click', (e) => {
    if (!e.target.classList.contains('delete-button') && !e.target.classList.contains('edit-button')) {
      navigateToUrl(jumpmark.url);
    }
  });
  
  // 編集ボタンのクリックイベント
  const editButton = div.querySelector('.edit-button');
  editButton.addEventListener('click', (e) => {
    e.stopPropagation();
    editJumpmark(jumpmark);
  });
  
  // 削除ボタンのクリックイベント
  const deleteButton = div.querySelector('.delete-button');
  deleteButton.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteJumpmark(jumpmark.id);
  });
  
  return div;
}

// HTMLエスケープ
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// URLに移動（同一URLのタブがあればフォーカス、なければ新タブ作成）
async function navigateToUrl(url) {
  try {
    // 全てのタブを取得
    const tabs = await chrome.tabs.query({});
    
    // 完全に同じURLのタブを探す
    const exactTab = tabs.find(tab => {
      return tab.url === url;
    });
    
    if (exactTab) {
      // 同じURLのタブがある場合：フォーカスのみ（リロードしない）
      await chrome.tabs.update(exactTab.id, { active: true });
      await chrome.windows.update(exactTab.windowId, { focused: true });
    } else {
      // 同じURLのタブがない場合：新しいタブを作成
      await chrome.tabs.create({ 
        url: url,
        active: true 
      });
    }
    
    window.close();
  } catch (error) {
    console.error('ナビゲーションエラー:', error);
    // エラーが発生した場合は従来通り新しいタブで開く
    try {
      await chrome.tabs.create({ url: url });
      window.close();
    } catch (fallbackError) {
      console.error('フォールバックナビゲーションエラー:', fallbackError);
    }
  }
}

// Jumpmarkを削除
async function deleteJumpmark(jumpmarkId) {
  try {
    const result = await chrome.storage.sync.get(['jumpmarks']);
    const allJumpmarks = result.jumpmarks || {};
    
    if (allJumpmarks[currentUrl]) {
      allJumpmarks[currentUrl] = allJumpmarks[currentUrl].filter(
        jumpmark => jumpmark.id !== jumpmarkId
      );
      
      // 空になった場合は配列自体を削除
      if (allJumpmarks[currentUrl].length === 0) {
        delete allJumpmarks[currentUrl];
      }
      
      await chrome.storage.sync.set({ jumpmarks: allJumpmarks });
      await displayJumpmarks();
    }
  } catch (error) {
    console.error('Jumpmark削除エラー:', error);
  }
}

// Jumpmarkを保存
async function saveJumpmark(jumpmarkData) {
  try {
    const result = await chrome.storage.sync.get(['jumpmarks']);
    const allJumpmarks = result.jumpmarks || {};
    
    // 現在のURLのJumpmarksを取得
    if (!allJumpmarks[currentUrl]) {
      allJumpmarks[currentUrl] = [];
    }
    
    // 新しいJumpmarkを追加
    const newJumpmark = {
      id: generateId(),
      title: jumpmarkData.title,
      url: jumpmarkData.url,
      icon: jumpmarkData.icon || '🔗',
      bidirectional: jumpmarkData.bidirectional,
      created: new Date().toISOString()
    };
    
    allJumpmarks[currentUrl].push(newJumpmark);
    
    // 双方向リンクの場合、逆方向も作成
    if (jumpmarkData.bidirectional) {
      const targetUrl = normalizeUrl(jumpmarkData.url);
      if (!allJumpmarks[targetUrl]) {
        allJumpmarks[targetUrl] = [];
      }
      
      const reverseJumpmark = {
        id: generateId(),
        title: `← ${currentTab.title || 'ページ'}`,
        url: currentTab.url,
        icon: jumpmarkData.icon || '🔗',
        bidirectional: false, // 逆方向はfalse
        created: new Date().toISOString()
      };
      
      allJumpmarks[targetUrl].push(reverseJumpmark);
    }
    
    await chrome.storage.sync.set({ jumpmarks: allJumpmarks });
    return true;
  } catch (error) {
    console.error('Jumpmark保存エラー:', error);
    return false;
  }
}

// Jumpmarkを更新
async function updateJumpmark(jumpmarkId, jumpmarkData) {
  try {
    const result = await chrome.storage.sync.get(['jumpmarks']);
    const allJumpmarks = result.jumpmarks || {};
    
    // 既存のJumpmarkを検索して更新
    let originalJumpmark = null;
    let foundUrl = null;
    
    for (const url in allJumpmarks) {
      const jumpmark = allJumpmarks[url].find(jm => jm.id === jumpmarkId);
      if (jumpmark) {
        originalJumpmark = jumpmark;
        foundUrl = url;
        break;
      }
    }
    
    if (!originalJumpmark) {
      console.error('更新対象のJumpmarkが見つかりません');
      return false;
    }
    
    // 双方向リンクの処理：元のJumpmarkが双方向だった場合、逆方向も削除
    if (originalJumpmark.bidirectional) {
      const targetUrl = normalizeUrl(originalJumpmark.url);
      if (allJumpmarks[targetUrl]) {
        // 逆方向のJumpmarkを探して削除
        allJumpmarks[targetUrl] = allJumpmarks[targetUrl].filter(jm => 
          !(jm.url === currentTab.url && jm.bidirectional === false)
        );
        if (allJumpmarks[targetUrl].length === 0) {
          delete allJumpmarks[targetUrl];
        }
      }
    }
    
    // Jumpmarkを更新
    const jumpmarkIndex = allJumpmarks[foundUrl].findIndex(jm => jm.id === jumpmarkId);
    allJumpmarks[foundUrl][jumpmarkIndex] = {
      ...originalJumpmark,
      title: jumpmarkData.title,
      url: jumpmarkData.url,
      icon: jumpmarkData.icon || '🔗',
      bidirectional: jumpmarkData.bidirectional
    };
    
    // 新しい双方向リンクの処理
    if (jumpmarkData.bidirectional) {
      const targetUrl = normalizeUrl(jumpmarkData.url);
      if (!allJumpmarks[targetUrl]) {
        allJumpmarks[targetUrl] = [];
      }
      
      const reverseJumpmark = {
        id: generateId(),
        title: `← ${currentTab.title || 'ページ'}`,
        url: currentTab.url,
        icon: jumpmarkData.icon || '🔗',
        bidirectional: false,
        created: new Date().toISOString()
      };
      
      allJumpmarks[targetUrl].push(reverseJumpmark);
    }
    
    await chrome.storage.sync.set({ jumpmarks: allJumpmarks });
    return true;
  } catch (error) {
    console.error('Jumpmark更新エラー:', error);
    return false;
  }
}

// ユニークIDを生成
function generateId() {
  return 'jm-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// ビューを切り替え
function showFormView() {
  mainView.classList.add('hidden');
  formView.classList.remove('hidden');
  
  // フォームタイトルを変更
  formTitle.textContent = '新しいJumpmark';
  
  // フォームをリセット
  jumpmarkForm.reset();
  document.getElementById('bidirectional').checked = true;
  
  // 編集状態をリセット
  editingJumpmark = null;
}

function showMainView() {
  formView.classList.add('hidden');
  mainView.classList.remove('hidden');
  
  // 編集状態をリセット
  editingJumpmark = null;
}

// Jumpmarkを編集
function editJumpmark(jumpmark) {
  editingJumpmark = jumpmark;
  
  // フォームタイトルを変更
  formTitle.textContent = 'Jumpmarkを編集';
  
  // フォームに既存データを入力
  document.getElementById('jumpmarkTitle').value = jumpmark.title;
  document.getElementById('jumpmarkUrl').value = jumpmark.url;
  document.getElementById('jumpmarkIcon').value = jumpmark.icon || '';
  document.getElementById('bidirectional').checked = jumpmark.bidirectional;
  
  // フォーム画面を表示
  mainView.classList.add('hidden');
  formView.classList.remove('hidden');
}

// イベントリスナーの設定
function setupEventListeners() {
  // 追加ボタン
  addButton.addEventListener('click', showFormView);
  
  // 戻るボタン
  backButton.addEventListener('click', showMainView);
  
  // キャンセルボタン
  cancelButton.addEventListener('click', showMainView);
  
  // フォーム送信
  jumpmarkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(jumpmarkForm);
    const jumpmarkData = {
      title: formData.get('jumpmarkTitle') || document.getElementById('jumpmarkTitle').value,
      url: formData.get('jumpmarkUrl') || document.getElementById('jumpmarkUrl').value,
      icon: formData.get('jumpmarkIcon') || document.getElementById('jumpmarkIcon').value,
      bidirectional: document.getElementById('bidirectional').checked
    };
    
    // 基本的なバリデーション
    if (!jumpmarkData.title || !jumpmarkData.url) {
      alert('タイトルとURLは必須です');
      return;
    }
    
    try {
      new URL(jumpmarkData.url);
    } catch {
      alert('有効なURLを入力してください');
      return;
    }
    
    let success;
    if (editingJumpmark) {
      // 編集モード
      success = await updateJumpmark(editingJumpmark.id, jumpmarkData);
    } else {
      // 新規作成モード
      success = await saveJumpmark(jumpmarkData);
    }
    
    if (success) {
      showMainView();
      await displayJumpmarks();
    } else {
      alert(editingJumpmark ? '更新に失敗しました' : '保存に失敗しました');
    }
  });
}