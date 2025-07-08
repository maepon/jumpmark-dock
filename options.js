// オプションページのメインスクリプト

// グローバル変数
let allJumpmarks = [];
let filteredJumpmarks = [];
let selectedJumpmarks = new Set();
let currentPage = 1;
let itemsPerPage = 20;
let currentTab = 'manage';

// DOM要素
const navTabs = document.querySelectorAll('.nav-tab');
const tabContents = document.querySelectorAll('.tab-content');
const versionInfo = document.getElementById('versionInfo');
const searchInput = document.getElementById('searchInput');
const sortBy = document.getElementById('sortBy');
const filterBy = document.getElementById('filterBy');
const selectAllButton = document.getElementById('selectAll');
const deleteSelectedButton = document.getElementById('deleteSelected');
const exportSelectedButton = document.getElementById('exportSelected');
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const jumpmarkTableBody = document.getElementById('jumpmarkTableBody');
const jumpmarkTableContainer = document.getElementById('jumpmarkTableContainer');
const loadingIndicator = document.getElementById('loadingIndicator');
const emptyState = document.getElementById('emptyState');
const pagination = document.getElementById('pagination');
const prevPageButton = document.getElementById('prevPage');
const nextPageButton = document.getElementById('nextPage');
const pageInfo = document.getElementById('pageInfo');
const statusMessage = document.getElementById('statusMessage');
const confirmModal = document.getElementById('confirmModal');
const confirmTitle = document.getElementById('confirmTitle');
const confirmMessage = document.getElementById('confirmMessage');
const confirmCancel = document.getElementById('confirmCancel');
const confirmOk = document.getElementById('confirmOk');

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await init();
  } catch (error) {
    console.error('初期化エラー:', error);
    showStatusMessage('初期化エラーが発生しました', 'error');
  }
});

// メイン初期化関数
async function init() {
  // バージョン情報を設定
  versionInfo.textContent = `v${getExtensionVersion()}`;
  
  // イベントリスナーを設定
  setupEventListeners();
  
  // 初期データを読み込み
  await loadJumpmarks();
  
  showStatusMessage('準備完了');
}

// イベントリスナーを設定
function setupEventListeners() {
  // タブ切り替え
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
  
  // 検索とフィルタリング
  searchInput.addEventListener('input', debounce(handleSearch, 300));
  sortBy.addEventListener('change', handleSort);
  filterBy.addEventListener('change', handleFilter);
  
  // 一括操作
  selectAllButton.addEventListener('click', toggleSelectAll);
  deleteSelectedButton.addEventListener('click', deleteSelectedJumpmarks);
  exportSelectedButton.addEventListener('click', exportSelectedJumpmarks);
  selectAllCheckbox.addEventListener('change', toggleSelectAll);
  
  // ページネーション
  prevPageButton.addEventListener('click', () => changePage(currentPage - 1));
  nextPageButton.addEventListener('click', () => changePage(currentPage + 1));
  
  // モーダル
  confirmCancel.addEventListener('click', closeConfirmModal);
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
      closeConfirmModal();
    }
  });
  
  // ストレージ変更の監視
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.jumpmarks) {
      loadJumpmarks();
    }
  });
}

// タブを切り替え
function switchTab(tabId) {
  // アクティブなタブを更新
  navTabs.forEach(tab => {
    if (tab.getAttribute('data-tab') === tabId) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
  
  // アクティブなコンテンツを更新
  tabContents.forEach(content => {
    if (content.id === `${tabId}Tab`) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });
  
  currentTab = tabId;
  
  // タブ別の初期化処理
  if (tabId === 'manage') {
    loadJumpmarks();
  }
}

// Jumpmarksを読み込み
async function loadJumpmarks() {
  try {
    showLoading();
    
    allJumpmarks = await getAllJumpmarks();
    filteredJumpmarks = [...allJumpmarks];
    
    // 現在のフィルタとソートを適用
    applyFilters();
    applySorting();
    
    // 表示を更新
    updateDisplay();
    
    showStatusMessage(`${allJumpmarks.length}件のJumpmarkを読み込みました`);
  } catch (error) {
    console.error('Jumpmarks読み込みエラー:', error);
    showStatusMessage('Jumpmarksの読み込みに失敗しました', 'error');
  }
}

// 検索を処理
function handleSearch() {
  const query = searchInput.value.toLowerCase().trim();
  
  if (query === '') {
    filteredJumpmarks = [...allJumpmarks];
  } else {
    filteredJumpmarks = allJumpmarks.filter(jumpmark => 
      jumpmark.title.toLowerCase().includes(query) ||
      jumpmark.url.toLowerCase().includes(query) ||
      jumpmark.sourceUrl.toLowerCase().includes(query)
    );
  }
  
  currentPage = 1;
  updateDisplay();
}

// ソートを処理
function handleSort() {
  applySorting();
  updateDisplay();
}

// フィルタを処理
function handleFilter() {
  applyFilters();
  updateDisplay();
}

// フィルタを適用
function applyFilters() {
  const filter = filterBy.value;
  const query = searchInput.value.toLowerCase().trim();
  
  filteredJumpmarks = allJumpmarks.filter(jumpmark => {
    // タイプフィルタ
    let typeMatch = true;
    if (filter === 'original') {
      typeMatch = jumpmark.bidirectional === true;
    } else if (filter === 'bidirectional') {
      typeMatch = jumpmark.bidirectional === false;
    }
    
    // 検索フィルタ
    let searchMatch = true;
    if (query) {
      searchMatch = jumpmark.title.toLowerCase().includes(query) ||
                   jumpmark.url.toLowerCase().includes(query) ||
                   jumpmark.sourceUrl.toLowerCase().includes(query);
    }
    
    return typeMatch && searchMatch;
  });
}

// ソートを適用
function applySorting() {
  const sort = sortBy.value;
  
  filteredJumpmarks.sort((a, b) => {
    switch (sort) {
      case 'title':
        return a.title.localeCompare(b.title);
      case 'url':
        return a.url.localeCompare(b.url);
      case 'created':
      default:
        return new Date(b.created) - new Date(a.created);
    }
  });
}

// 表示を更新
function updateDisplay() {
  hideLoading();
  
  if (filteredJumpmarks.length === 0) {
    showEmptyState();
  } else {
    showJumpmarksList();
  }
  
  updatePagination();
  updateBulkActions();
}

// ローディングを表示
function showLoading() {
  loadingIndicator.style.display = 'flex';
  jumpmarkTableContainer.style.display = 'none';
  emptyState.style.display = 'none';
}

// ローディングを非表示
function hideLoading() {
  loadingIndicator.style.display = 'none';
}

// 空状態を表示
function showEmptyState() {
  emptyState.style.display = 'block';
  jumpmarkTableContainer.style.display = 'none';
  pagination.style.display = 'none';
}

// Jumpmarksリストを表示
function showJumpmarksList() {
  emptyState.style.display = 'none';
  jumpmarkTableContainer.style.display = 'block';
  
  // ページネーション用のデータを計算
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageJumpmarks = filteredJumpmarks.slice(startIndex, endIndex);
  
  // テーブルボディをクリア
  jumpmarkTableBody.innerHTML = '';
  
  // 各Jumpmarkの行を作成
  pageJumpmarks.forEach(jumpmark => {
    const row = createJumpmarkRow(jumpmark);
    jumpmarkTableBody.appendChild(row);
  });
  
  // ページネーションを表示
  if (filteredJumpmarks.length > itemsPerPage) {
    pagination.style.display = 'flex';
  } else {
    pagination.style.display = 'none';
  }
}

// Jumpmarkの行を作成
function createJumpmarkRow(jumpmark) {
  const row = document.createElement('tr');
  
  const isSelected = selectedJumpmarks.has(jumpmark.id);
  const typeClass = jumpmark.bidirectional ? 'type-original' : 'type-bidirectional';
  const typeText = jumpmark.bidirectional ? 'オリジナル' : '双方向';
  
  row.innerHTML = `
    <td class="checkbox-column">
      <input type="checkbox" ${isSelected ? 'checked' : ''} data-id="${jumpmark.id}">
    </td>
    <td class="icon-column">
      <span class="jumpmark-icon">${jumpmark.icon || '🔗'}</span>
    </td>
    <td class="title-column">
      <div class="jumpmark-title">${escapeHtml(jumpmark.title)}</div>
      <div class="jumpmark-url">${escapeHtml(jumpmark.sourceUrl)}</div>
    </td>
    <td class="url-column">
      <div class="jumpmark-url">${escapeHtml(jumpmark.url)}</div>
    </td>
    <td class="type-column">
      <span class="jumpmark-type ${typeClass}">${typeText}</span>
    </td>
    <td class="created-column">
      <div class="jumpmark-created">${formatDate(jumpmark.created)}</div>
    </td>
    <td class="actions-column">
      <div class="jumpmark-actions">
        <button class="action-btn action-edit" data-id="${jumpmark.id}">編集</button>
        <button class="action-btn action-delete" data-id="${jumpmark.id}">削除</button>
      </div>
    </td>
  `;
  
  // イベントリスナーを追加
  const checkbox = row.querySelector('input[type="checkbox"]');
  checkbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      selectedJumpmarks.add(jumpmark.id);
    } else {
      selectedJumpmarks.delete(jumpmark.id);
    }
    updateBulkActions();
    updateSelectAllCheckbox();
  });
  
  const editButton = row.querySelector('.action-edit');
  editButton.addEventListener('click', () => editJumpmark(jumpmark));
  
  const deleteButton = row.querySelector('.action-delete');
  deleteButton.addEventListener('click', () => deleteJumpmark(jumpmark));
  
  // 行クリックで移動
  row.addEventListener('click', (e) => {
    if (e.target.type !== 'checkbox' && !e.target.classList.contains('action-btn')) {
      navigateToUrl(jumpmark.url);
    }
  });
  
  return row;
}

// ページネーションを更新
function updatePagination() {
  const totalPages = Math.ceil(filteredJumpmarks.length / itemsPerPage);
  
  prevPageButton.disabled = currentPage <= 1;
  nextPageButton.disabled = currentPage >= totalPages;
  
  pageInfo.textContent = `${currentPage} / ${totalPages}`;
}

// ページを変更
function changePage(page) {
  const totalPages = Math.ceil(filteredJumpmarks.length / itemsPerPage);
  
  if (page >= 1 && page <= totalPages) {
    currentPage = page;
    updateDisplay();
  }
}

// 一括操作ボタンを更新
function updateBulkActions() {
  const hasSelected = selectedJumpmarks.size > 0;
  
  deleteSelectedButton.disabled = !hasSelected;
  exportSelectedButton.disabled = !hasSelected;
  
  if (hasSelected) {
    deleteSelectedButton.textContent = `選択を削除 (${selectedJumpmarks.size})`;
    exportSelectedButton.textContent = `選択をエクスポート (${selectedJumpmarks.size})`;
  } else {
    deleteSelectedButton.textContent = '選択を削除';
    exportSelectedButton.textContent = '選択をエクスポート';
  }
}

// 全選択チェックボックスを更新
function updateSelectAllCheckbox() {
  const pageJumpmarks = getCurrentPageJumpmarks();
  const allSelected = pageJumpmarks.every(jumpmark => selectedJumpmarks.has(jumpmark.id));
  const noneSelected = pageJumpmarks.every(jumpmark => !selectedJumpmarks.has(jumpmark.id));
  
  selectAllCheckbox.checked = allSelected;
  selectAllCheckbox.indeterminate = !allSelected && !noneSelected;
}

// 現在のページのJumpmarksを取得
function getCurrentPageJumpmarks() {
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  return filteredJumpmarks.slice(startIndex, endIndex);
}

// 全選択/全解除を切り替え
function toggleSelectAll() {
  const pageJumpmarks = getCurrentPageJumpmarks();
  const allSelected = pageJumpmarks.every(jumpmark => selectedJumpmarks.has(jumpmark.id));
  
  if (allSelected) {
    // 全解除
    pageJumpmarks.forEach(jumpmark => {
      selectedJumpmarks.delete(jumpmark.id);
    });
  } else {
    // 全選択
    pageJumpmarks.forEach(jumpmark => {
      selectedJumpmarks.add(jumpmark.id);
    });
  }
  
  updateDisplay();
}

// 選択されたJumpmarksを削除
function deleteSelectedJumpmarks() {
  if (selectedJumpmarks.size === 0) return;
  
  const count = selectedJumpmarks.size;
  showConfirmModal(
    '選択したJumpmarksを削除',
    `${count}件のJumpmarkを削除します。この操作は取り消せません。`,
    async () => {
      try {
        const ids = Array.from(selectedJumpmarks);
        const deletedCount = await deleteJumpmarks(ids);
        
        selectedJumpmarks.clear();
        await loadJumpmarks();
        
        showStatusMessage(`${deletedCount}件のJumpmarkを削除しました`);
      } catch (error) {
        console.error('削除エラー:', error);
        showStatusMessage('削除に失敗しました', 'error');
      }
    }
  );
}

// 選択されたJumpmarksをエクスポート
function exportSelectedJumpmarks() {
  if (selectedJumpmarks.size === 0) return;
  
  const selectedData = allJumpmarks.filter(jumpmark => selectedJumpmarks.has(jumpmark.id));
  exportJumpmarks(selectedData);
}

// Jumpmarksをエクスポート（簡易版）
function exportJumpmarks(jumpmarks) {
  const data = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    jumpmarks: jumpmarks,
    metadata: {
      totalCount: jumpmarks.length,
      extensionVersion: getExtensionVersion()
    }
  };
  
  const dataStr = JSON.stringify(data, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `jumpmarks-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
  
  showStatusMessage(`${jumpmarks.length}件のJumpmarkをエクスポートしました`);
}

// Jumpmarkを編集
function editJumpmark(jumpmark) {
  // 簡易版：アラートで表示
  const newTitle = prompt('新しいタイトル:', jumpmark.title);
  if (newTitle !== null && newTitle.trim() !== '') {
    updateJumpmark(jumpmark.id, { title: newTitle.trim() })
      .then(() => {
        loadJumpmarks();
        showStatusMessage('Jumpmarkを更新しました');
      })
      .catch(error => {
        console.error('更新エラー:', error);
        showStatusMessage('更新に失敗しました', 'error');
      });
  }
}

// Jumpmarkを削除
function deleteJumpmark(jumpmark) {
  showConfirmModal(
    'Jumpmarkを削除',
    `「${jumpmark.title}」を削除します。この操作は取り消せません。`,
    async () => {
      try {
        await deleteJumpmark(jumpmark.id);
        await loadJumpmarks();
        showStatusMessage('Jumpmarkを削除しました');
      } catch (error) {
        console.error('削除エラー:', error);
        showStatusMessage('削除に失敗しました', 'error');
      }
    }
  );
}

// 確認モーダルを表示
function showConfirmModal(title, message, onConfirm) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  
  confirmModal.classList.add('active');
  
  // 確認ボタンのイベントリスナーを設定
  const handleConfirm = () => {
    closeConfirmModal();
    onConfirm();
    confirmOk.removeEventListener('click', handleConfirm);
  };
  
  confirmOk.addEventListener('click', handleConfirm);
}

// 確認モーダルを閉じる
function closeConfirmModal() {
  confirmModal.classList.remove('active');
}

// ステータスメッセージを表示
function showStatusMessage(message, type = 'success') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  
  // 3秒後に自動的にクリア
  setTimeout(() => {
    statusMessage.textContent = '準備完了';
    statusMessage.className = 'status-message';
  }, 3000);
}