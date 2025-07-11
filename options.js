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
const editModal = document.getElementById('editModal');
const editModalTitle = document.getElementById('editModalTitle');
const editForm = document.getElementById('editForm');
const editTitle = document.getElementById('editTitle');
const editUrl = document.getElementById('editUrl');
const editIcon = document.getElementById('editIcon');
const editCreateReverse = document.getElementById('editCreateReverse');
const editSourceUrl = document.getElementById('editSourceUrl');
const editCancel = document.getElementById('editCancel');
const editSave = document.getElementById('editSave');
const editError = document.getElementById('editError');
const urlPreview = document.getElementById('urlPreview');
const normalizedUrl = document.getElementById('normalizedUrl');
const totalJumpmarksElement = document.getElementById('totalJumpmarks');
const storageUsageElement = document.getElementById('storageUsage');
const storageProgressElement = document.getElementById('storageProgress');

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
  prevPageButton.addEventListener('click', async () => await changePage(currentPage - 1));
  nextPageButton.addEventListener('click', async () => await changePage(currentPage + 1));
  
  // モーダル
  confirmCancel.addEventListener('click', closeConfirmModal);
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
      closeConfirmModal();
    }
  });
  
  // 編集モーダル
  editCancel.addEventListener('click', closeEditModal);
  editModal.addEventListener('click', (e) => {
    if (e.target === editModal) {
      closeEditModal();
    }
  });
  editForm.addEventListener('submit', handleEditFormSubmit);
  editUrl.addEventListener('input', debounce(handleUrlPreview, 300));
  editUrl.addEventListener('input', debounce(async () => {
    const editingId = editModal.getAttribute('data-editing-id');
    if (editingId) {
      // 編集中の元jumpmarkを取得
      const originalJumpmark = allJumpmarks.find(jm => jm.id === editingId);
      if (originalJumpmark) {
        await updateBidirectionalCheckboxState(originalJumpmark);
      }
    }
  }, 300));
  
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
  } else if (tabId === 'import-export') {
    setupImportExportListeners();
    updateExportStats();
  }
}

// Jumpmarksを読み込み
async function loadJumpmarks() {
  try {
    showLoading();
    
    allJumpmarks = await getAllJumpmarks();
    filteredJumpmarks = [...allJumpmarks];
    
    // 現在のフィルタとソートを適用
    await applyFilters();
    applySorting();
    
    // 表示を更新
    await updateDisplay();
    
    // 統計を更新
    await updateStorageStats();
    
    showStatusMessage(`${allJumpmarks.length}件のJumpmarkを読み込みました`);
  } catch (error) {
    console.error('Jumpmarks読み込みエラー:', error);
    showStatusMessage('Jumpmarksの読み込みに失敗しました', 'error');
  }
}

// 検索を処理
async function handleSearch() {
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
  await updateDisplay();
}

// ソートを処理
async function handleSort() {
  applySorting();
  await updateDisplay();
}

// フィルタを処理
async function handleFilter() {
  applyFilters();
  await updateDisplay();
}

// フィルタを適用
async function applyFilters() {
  const filter = filterBy.value;
  const query = searchInput.value.toLowerCase().trim();
  
  // 全てのJumpmarkに対してフィルタを適用
  const filteredResults = [];
  
  for (const jumpmark of allJumpmarks) {
    // タイプフィルタ
    let typeMatch = true;
    if (filter === 'single' || filter === 'bidirectional') {
      const partner = await findBidirectionalPartner(jumpmark);
      const hasPart = !!partner;
      
      if (filter === 'single') {
        typeMatch = !hasPart;
      } else if (filter === 'bidirectional') {
        typeMatch = hasPart;
      }
    }
    
    // 検索フィルタ
    let searchMatch = true;
    if (query) {
      searchMatch = jumpmark.title.toLowerCase().includes(query) ||
                   jumpmark.url.toLowerCase().includes(query) ||
                   jumpmark.sourceUrl.toLowerCase().includes(query);
    }
    
    if (typeMatch && searchMatch) {
      filteredResults.push(jumpmark);
    }
  }
  
  filteredJumpmarks = filteredResults;
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
async function updateDisplay() {
  hideLoading();
  
  if (filteredJumpmarks.length === 0) {
    showEmptyState();
  } else {
    await showJumpmarksList();
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
async function showJumpmarksList() {
  emptyState.style.display = 'none';
  jumpmarkTableContainer.style.display = 'block';
  
  // ページネーション用のデータを計算
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageJumpmarks = filteredJumpmarks.slice(startIndex, endIndex);
  
  // テーブルボディをクリア
  jumpmarkTableBody.innerHTML = '';
  
  // 各Jumpmarkの行を作成（非同期）
  for (const jumpmark of pageJumpmarks) {
    const row = await createJumpmarkRow(jumpmark);
    jumpmarkTableBody.appendChild(row);
  }
  
  // ページネーションを表示
  if (filteredJumpmarks.length > itemsPerPage) {
    pagination.style.display = 'flex';
  } else {
    pagination.style.display = 'none';
  }
}

// Jumpmarkの行を作成
async function createJumpmarkRow(jumpmark) {
  const row = document.createElement('tr');
  
  const isSelected = selectedJumpmarks.has(jumpmark.id);
  
  // 双方向パートナーの有無を確認
  const partner = await findBidirectionalPartner(jumpmark);
  const typeClass = partner ? 'type-bidirectional' : 'type-single';
  const typeText = partner ? '双方向' : '単独';
  
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
  deleteButton.addEventListener('click', () => deleteJumpmarkWithConfirm(jumpmark));
  
  // URLセルクリックで移動
  const urlCell = row.querySelector('.jumpmark-url');
  if (urlCell) {
    urlCell.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateToUrl(jumpmark.url);
    });
  }
  
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
async function changePage(page) {
  const totalPages = Math.ceil(filteredJumpmarks.length / itemsPerPage);
  
  if (page >= 1 && page <= totalPages) {
    currentPage = page;
    await updateDisplay();
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
async function editJumpmark(jumpmark) {
  // モーダルフォームに値を設定
  editModalTitle.textContent = 'Jumpmarkを編集';
  editTitle.value = jumpmark.title || '';
  editUrl.value = jumpmark.url || '';
  editIcon.value = jumpmark.icon || '🔗';
  editCreateReverse.checked = false; // 編集時はデフォルトでOFF
  editSourceUrl.textContent = jumpmark.sourceUrl || '';
  
  // 編集対象のJumpmarkを記録
  editModal.setAttribute('data-editing-id', jumpmark.id);
  
  // エラーをクリア
  clearEditError();
  
  // 双方向パートナーをチェックして戻りリンク作成チェックボックスを制御
  await updateBidirectionalCheckboxState(jumpmark);
  
  // URL正規化プレビューを更新
  handleUrlPreview();
  
  // モーダルを表示
  editModal.classList.add('active');
  editTitle.focus();
}

// 編集モーダルを閉じる
function closeEditModal() {
  editModal.classList.remove('active');
  editForm.reset();
  clearEditError();
}

// 編集フォーム送信処理
async function handleEditFormSubmit(e) {
  e.preventDefault();
  
  try {
    clearEditError();
    
    // フォームの値を取得
    const title = editTitle.value.trim();
    const url = editUrl.value.trim();
    const icon = editIcon.value.trim() || '🔗';
    const createReverse = editCreateReverse.checked;
    
    // バリデーション
    if (!title) {
      showEditError('タイトルを入力してください');
      editTitle.focus();
      return;
    }
    
    if (!url) {
      showEditError('URLを入力してください');
      editUrl.focus();
      return;
    }
    
    if (!validateUrl(url)) {
      showEditError('有効なURLを入力してください');
      editUrl.focus();
      return;
    }
    
    // 編集対象のIDを取得
    const jumpmarkId = editModal.getAttribute('data-editing-id');
    if (!jumpmarkId) {
      showEditError('編集対象が見つかりません');
      return;
    }
    
    // 更新データを準備
    const updateData = {
      title,
      url,
      icon
    };
    
    // Jumpmarkを更新
    await updateJumpmark(jumpmarkId, updateData);
    
    // 戻りリンク作成がチェックされている場合、新しい戻りリンクを作成
    if (createReverse) {
      // 編集中のJumpmarkを取得
      const allJumpmarks = await getAllJumpmarks();
      const currentJumpmark = allJumpmarks.find(jm => jm.id === jumpmarkId);
      
      if (currentJumpmark) {
        // 双方向パートナーが既に存在するかチェック
        const updatedJumpmark = {
          ...currentJumpmark,
          url: url  // 更新されたURLを使用
        };
        const existingPartner = await findBidirectionalPartner(updatedJumpmark);
        
        if (!existingPartner) {
          // パートナーが存在しない場合のみ戻りリンクを作成
          const reverseJumpmarkData = {
            title: `← ${title}`,
            url: `https://${currentJumpmark.sourceUrl}`,
            icon: icon,
            sourceUrl: normalizeUrl(url)
          };
          
          await saveJumpmark(reverseJumpmarkData);
        }
      }
    }
    
    // モーダルを閉じる
    closeEditModal();
    
    showStatusMessage('Jumpmarkを更新しました');
    
  } catch (error) {
    console.error('編集エラー:', error);
    showEditError('更新に失敗しました: ' + error.message);
  }
}

// URL正規化プレビューを処理
function handleUrlPreview() {
  const url = editUrl.value.trim();
  
  if (url && validateUrl(url)) {
    const normalized = normalizeUrl(url);
    normalizedUrl.textContent = normalized;
    urlPreview.style.display = 'block';
  } else {
    urlPreview.style.display = 'none';
  }
}

// 編集エラーを表示
function showEditError(message) {
  const errorMessageElement = editError.querySelector('.error-message');
  errorMessageElement.textContent = message;
  editError.style.display = 'block';
}

// 編集エラーをクリア
function clearEditError() {
  editError.style.display = 'none';
}

// 双方向チェックボックスの状態を更新
async function updateBidirectionalCheckboxState(jumpmark) {
  try {
    // 現在の編集対象jumpmarkから新しいjumpmarkオブジェクトを作成してパートナーチェック
    const currentJumpmark = {
      ...jumpmark,
      url: editUrl.value.trim()
    };
    
    const partner = await findBidirectionalPartner(currentJumpmark);
    const bidirectionalStatus = document.getElementById('editBidirectionalStatus');
    
    if (partner) {
      // パートナーが存在する場合：チェックボックスを無効化
      editCreateReverse.disabled = true;
      editCreateReverse.checked = false;
      bidirectionalStatus.style.display = 'block';
    } else {
      // パートナーが存在しない場合：チェックボックスを有効化
      editCreateReverse.disabled = false;
      bidirectionalStatus.style.display = 'none';
    }
  } catch (error) {
    console.error('双方向チェックボックス状態更新エラー:', error);
    // エラー時はチェックボックスを有効化（安全側に倒す）
    editCreateReverse.disabled = false;
    document.getElementById('editBidirectionalStatus').style.display = 'none';
  }
}

// Jumpmarkを削除
async function deleteJumpmarkWithConfirm(jumpmark) {
  try {
    // 双方向パートナーを検索
    const partner = await findBidirectionalPartner(jumpmark);
    
    if (partner) {
      // パートナーがある場合：選択肢を提示
      showBidirectionalDeleteModal(jumpmark, partner);
    } else {
      // パートナーがない場合：通常の削除確認
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
  } catch (error) {
    console.error('削除処理エラー:', error);
    showStatusMessage('削除処理でエラーが発生しました', 'error');
  }
}

// 双方向削除の選択モーダル
function showBidirectionalDeleteModal(jumpmark, partner) {
  const modalHtml = `
    <div class="modal active" id="bidirectionalDeleteModal">
      <div class="modal-content">
        <h3>関連するJumpmarkがあります</h3>
        <p>「${jumpmark.title}」と対になる「${partner.title}」があります。</p>
        <div class="modal-actions">
          <button id="deleteCancel" class="btn btn-secondary">キャンセル</button>
          <button id="deleteOnlyThis" class="btn btn-warning">このJumpmarkのみ削除</button>
          <button id="deleteBoth" class="btn btn-danger">両方削除</button>
        </div>
      </div>
    </div>
  `;
  
  // 既存のモーダルがあれば削除
  const existingModal = document.getElementById('bidirectionalDeleteModal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // 新しいモーダルを追加
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const modal = document.getElementById('bidirectionalDeleteModal');
  
  // イベントリスナーを設定
  document.getElementById('deleteOnlyThis').addEventListener('click', async () => {
    modal.remove();
    try {
      await deleteJumpmark(jumpmark.id);
      // ストレージ変更監視で自動的にloadJumpmarks()が呼ばれるため、手動呼び出しは不要
      showStatusMessage('Jumpmarkを削除しました');
    } catch (error) {
      console.error('削除エラー:', error);
      showStatusMessage('削除に失敗しました', 'error');
    }
  });
  
  document.getElementById('deleteBoth').addEventListener('click', async () => {
    modal.remove();
    try {
      await deleteBidirectionalPair(jumpmark.id, partner.id);
      // ストレージ変更監視で自動的にloadJumpmarks()が呼ばれるため、手動呼び出しは不要
      showStatusMessage('両方のJumpmarkを削除しました');
    } catch (error) {
      console.error('削除エラー:', error);
      showStatusMessage('削除に失敗しました', 'error');
    }
  });
  
  document.getElementById('deleteCancel').addEventListener('click', () => {
    modal.remove();
  });
  
  // モーダル外クリックで閉じる
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
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

// ストレージ情報を更新
async function updateStorageStats() {
  try {
    const stats = await getStorageStats();
    
    // 総Jumpmark数
    totalJumpmarksElement.textContent = stats.totalJumpmarks;
    
    // ストレージ使用量（小数点1桁まで）
    storageUsageElement.textContent = `${stats.storageUsed}KB`;
    
    // 使用率の計算（Chrome Sync制限: 102KB）
    const maxStorage = 102; // KB
    const usagePercent = Math.min((stats.storageUsed / maxStorage) * 100, 100);
    
    // プログレスバーの更新
    storageProgressElement.style.width = `${usagePercent}%`;
    
    // 使用量に応じてプログレスバーの色を変更
    storageProgressElement.classList.remove('warning', 'danger');
    if (usagePercent >= 90) {
      storageProgressElement.classList.add('danger');
    } else if (usagePercent >= 70) {
      storageProgressElement.classList.add('warning');
    }
    
    // 容量警告の表示（控えめに）
    if (usagePercent >= 95) {
      showStatusMessage('ストレージ容量が満杯に近づいています', 'error');
    }
    
  } catch (error) {
    console.error('統計更新エラー:', error);
    // エラー時はプレースホルダーを表示
    totalJumpmarksElement.textContent = '-';
    storageUsageElement.textContent = '-';
    storageProgressElement.style.width = '0%';
  }
}

// ==============================================================================
// インポート/エクスポート機能
// ==============================================================================

// インポート/エクスポートタブの変数
let selectedExportFormat = 'json';
let selectedExportRange = 'all';
let importFile = null;
let importData = null;
let importExportListenersSetup = false;

// インポート/エクスポートのイベントリスナーを設定
function setupImportExportListeners() {
  if (importExportListenersSetup) {
    return;
  }
  
  // エクスポートフォーマット選択
  const exportJsonBtn = document.getElementById('exportJson');
  const exportCsvBtn = document.getElementById('exportCsv');
  const exportHtmlBtn = document.getElementById('exportHtml');
  
  exportJsonBtn?.addEventListener('click', () => selectExportFormat('json'));
  exportCsvBtn?.addEventListener('click', () => selectExportFormat('csv'));
  exportHtmlBtn?.addEventListener('click', () => selectExportFormat('html'));
  
  // エクスポート範囲選択
  const exportRangeRadios = document.querySelectorAll('input[name="exportRange"]');
  exportRangeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      selectedExportRange = radio.value;
      updateExportStats();
    });
  });
  
  // インポートファイル選択
  const selectFileBtn = document.getElementById('selectFile');
  const importFileInput = document.getElementById('importFile');
  const fileDropZone = document.getElementById('fileDropZone');
  
  selectFileBtn?.addEventListener('click', () => importFileInput?.click());
  importFileInput?.addEventListener('change', handleFileSelect);
  
  // ドラッグ&ドロップ
  fileDropZone?.addEventListener('dragover', handleDragOver);
  fileDropZone?.addEventListener('dragleave', handleDragLeave);
  fileDropZone?.addEventListener('drop', handleFileDrop);
  
  // インポート関連
  const executeImportBtn = document.getElementById('executeImport');
  const cancelImportBtn = document.getElementById('cancelImport');
  const importMerge = document.getElementById('importMerge');
  const importSkipDuplicates = document.getElementById('importSkipDuplicates');
  
  executeImportBtn?.addEventListener('click', executeImport);
  cancelImportBtn?.addEventListener('click', cancelImport);
  importMerge?.addEventListener('change', updateImportPreview);
  importSkipDuplicates?.addEventListener('change', updateImportPreview);
  
  importExportListenersSetup = true;
}

// エクスポートフォーマットを選択
function selectExportFormat(format) {
  selectedExportFormat = format;
  
  // ボタンの状態を更新
  const formatButtons = document.querySelectorAll('.format-btn');
  formatButtons.forEach(btn => {
    btn.classList.remove('selected');
    if (btn.id === `export${format.charAt(0).toUpperCase() + format.slice(1)}`) {
      btn.classList.add('selected');
    }
  });
  
  updateExportStats();
  
  // フォーマットに応じてエクスポートを実行
  executeExport();
}

// エクスポート統計を更新
function updateExportStats() {
  const exportCountElement = document.getElementById('exportCount');
  if (!exportCountElement) return;
  
  let count = 0;
  
  switch (selectedExportRange) {
    case 'all':
      count = allJumpmarks.length;
      break;
    case 'selected':
      count = selectedJumpmarks.size;
      break;
    case 'filtered':
      count = filteredJumpmarks.length;
      break;
  }
  
  exportCountElement.textContent = count;
}

// エクスポート実行
async function executeExport() {
  try {
    showIEStatus('⏳', 'エクスポート準備中...', '');
    
    // エクスポート対象のデータを取得
    let dataToExport = [];
    
    switch (selectedExportRange) {
      case 'all':
        dataToExport = allJumpmarks;
        break;
      case 'selected':
        if (selectedJumpmarks.size === 0) {
          hideIEStatus();
          showStatusMessage('エクスポートするJumpmarkを選択してください', 'error');
          return;
        }
        dataToExport = allJumpmarks.filter(jm => selectedJumpmarks.has(jm.id));
        break;
      case 'filtered':
        dataToExport = filteredJumpmarks;
        break;
    }
    
    if (dataToExport.length === 0) {
      hideIEStatus();
      showStatusMessage('エクスポートするデータがありません', 'error');
      return;
    }
    
    showIEStatus('⏳', 'エクスポート中...', `${dataToExport.length}件のJumpmarkを処理中`);
    
    // フォーマットに応じてエクスポート
    let content, filename, mimeType;
    
    switch (selectedExportFormat) {
      case 'json':
        ({ content, filename, mimeType } = exportToJson(dataToExport));
        break;
      case 'csv':
        ({ content, filename, mimeType } = exportToCsv(dataToExport));
        break;
      case 'html':
        ({ content, filename, mimeType } = exportToHtml(dataToExport));
        break;
      default:
        throw new Error('未知のエクスポートフォーマット');
    }
    
    // ファイルをダウンロード
    downloadFile(content, filename, mimeType);
    
    showIEStatus('✅', 'エクスポート完了', `${dataToExport.length}件のJumpmarkをエクスポートしました`);
    
    setTimeout(hideIEStatus, 3000);
    
  } catch (error) {
    console.error('エクスポートエラー:', error);
    showIEStatus('❌', 'エクスポートエラー', error.message);
    setTimeout(hideIEStatus, 5000);
  }
}

// JSONエクスポート
function exportToJson(jumpmarks) {
  const exportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    jumpmarks: jumpmarks,
    metadata: {
      totalCount: jumpmarks.length,
      exportedBy: 'Jumpmark Dock',
      format: 'json'
    }
  };
  
  const content = JSON.stringify(exportData, null, 2);
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[:\-]/g, '').replace('T', '_');
  const filename = `jumpmarks_${timestamp}.json`;
  const mimeType = 'application/json';
  
  return { content, filename, mimeType };
}

// CSVエクスポート
function exportToCsv(jumpmarks) {
  const headers = ['ID', 'Title', 'URL', 'Icon', 'Source URL', 'Type', 'Created'];
  const rows = jumpmarks.map(jm => {
    const bidirectionalPartner = findBidirectionalPartner(jm);
    const type = bidirectionalPartner ? 'Bidirectional' : 'Single';
    
    return [
      escapeCSV(jm.id),
      escapeCSV(jm.title),
      escapeCSV(jm.url),
      escapeCSV(jm.icon || '🔗'),
      escapeCSV(jm.sourceUrl || ''),
      escapeCSV(type),
      escapeCSV(new Date(jm.created).toLocaleDateString('ja-JP'))
    ];
  });
  
  const content = [headers, ...rows].map(row => row.join(',')).join('\n');
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[:\-]/g, '').replace('T', '_');
  const filename = `jumpmarks_${timestamp}.csv`;
  const mimeType = 'text/csv';
  
  return { content, filename, mimeType };
}

// HTMLエクスポート
function exportToHtml(jumpmarks) {
  const timestamp = new Date().toLocaleString('ja-JP');
  
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jumpmark Dock - エクスポート</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; background-color: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background-color: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #4285f4; margin-bottom: 10px; }
    .meta { color: #666; margin-bottom: 30px; }
    .jumpmark { border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px; margin-bottom: 12px; }
    .jumpmark-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .jumpmark-icon { font-size: 20px; }
    .jumpmark-title { font-weight: 600; color: #202124; }
    .jumpmark-type { font-size: 12px; padding: 2px 6px; border-radius: 4px; font-weight: 500; }
    .type-single { background-color: #e8f5e8; color: #137333; }
    .type-bidirectional { background-color: #e8f0fe; color: #4285f4; }
    .jumpmark-url { color: #1a73e8; text-decoration: none; font-size: 14px; }
    .jumpmark-url:hover { text-decoration: underline; }
    .jumpmark-meta { font-size: 12px; color: #666; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔗 Jumpmark Dock</h1>
    <div class="meta">
      エクスポート日時: ${timestamp}<br>
      総件数: ${jumpmarks.length}件
    </div>
    ${jumpmarks.map(jm => {
      const bidirectionalPartner = findBidirectionalPartner(jm);
      const type = bidirectionalPartner ? 'Bidirectional' : 'Single';
      const typeClass = bidirectionalPartner ? 'type-bidirectional' : 'type-single';
      
      return `
        <div class="jumpmark">
          <div class="jumpmark-header">
            <span class="jumpmark-icon">${jm.icon || '🔗'}</span>
            <span class="jumpmark-title">${escapeHtml(jm.title)}</span>
            <span class="jumpmark-type ${typeClass}">${type}</span>
          </div>
          <a href="${jm.url}" class="jumpmark-url" target="_blank">${escapeHtml(jm.url)}</a>
          <div class="jumpmark-meta">
            作成日: ${new Date(jm.created).toLocaleDateString('ja-JP')}${jm.sourceUrl ? ` | 作成元: ${escapeHtml(jm.sourceUrl)}` : ''}
          </div>
        </div>
      `;
    }).join('')}
  </div>
</body>
</html>`;
  
  const timestamp2 = new Date().toISOString().slice(0, 16).replace(/[:\-]/g, '').replace('T', '_');
  const filename = `jumpmarks_${timestamp2}.html`;
  const mimeType = 'text/html';
  
  return { content: html, filename, mimeType };
}

// CSV用エスケープ
function escapeCSV(str) {
  if (str == null) return '';
  const stringValue = String(str);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

// HTML用エスケープ
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ファイルをダウンロード
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  URL.revokeObjectURL(url);
}

// ドラッグオーバー処理
function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

// ドラッグリーブ処理
function handleDragLeave(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
}

// ファイルドロップ処理
function handleFileDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    processImportFile(file);
  }
}

// ファイル選択処理
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    processImportFile(file);
  }
}

// インポートファイル処理
async function processImportFile(file) {
  try {
    if (!file.name.toLowerCase().endsWith('.json')) {
      showStatusMessage('JSONファイルを選択してください', 'error');
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) { // 5MB制限
      showStatusMessage('ファイルサイズが大きすぎます（5MB以下にしてください）', 'error');
      return;
    }
    
    showIEStatus('⏳', 'ファイル読み込み中...', '');
    
    const content = await readFileAsText(file);
    const data = JSON.parse(content);
    
    // データ形式の検証
    if (!validateImportData(data)) {
      throw new Error('無効なファイル形式です');
    }
    
    importFile = file;
    importData = data;
    
    // インポートオプションとプレビューを表示
    showImportOptions();
    updateImportPreview();
    
    hideIEStatus();
    
  } catch (error) {
    console.error('ファイル処理エラー:', error);
    showIEStatus('❌', 'ファイル処理エラー', error.message);
    setTimeout(hideIEStatus, 5000);
  }
}

// ファイルをテキストとして読み込み
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('ファイル読み込みエラー'));
    reader.readAsText(file, 'UTF-8');
  });
}

// インポートデータの検証
function validateImportData(data) {
  if (!data || typeof data !== 'object') return false;
  
  // jumpmarksプロパティが存在するか
  if (!Array.isArray(data.jumpmarks)) return false;
  
  // 各jumpmarkが必要なプロパティを持っているか
  return data.jumpmarks.every(jm => 
    jm && 
    typeof jm === 'object' &&
    typeof jm.id === 'string' &&
    typeof jm.title === 'string' &&
    typeof jm.url === 'string' &&
    typeof jm.created === 'string'
  );
}

// インポートオプションを表示
function showImportOptions() {
  const importOptions = document.getElementById('importOptions');
  if (importOptions) {
    importOptions.style.display = 'block';
  }
}

// インポートプレビューを更新
function updateImportPreview() {
  if (!importData) return;
  
  const importMerge = document.getElementById('importMerge');
  const importSkipDuplicates = document.getElementById('importSkipDuplicates');
  
  const mergeMode = importMerge?.checked || false;
  const skipDuplicates = importSkipDuplicates?.checked || false;
  
  const importJumpmarks = importData.jumpmarks || [];
  let newCount = 0;
  let skippedCount = 0;
  
  if (mergeMode && skipDuplicates) {
    // 重複チェック
    importJumpmarks.forEach(importJm => {
      try {
        const normalizedImportUrl = normalizeUrl(importJm.url);
        const normalizedSourceUrl = normalizeUrl(importJm.sourceUrl || '');
        
        const exists = allJumpmarks.some(existingJm => {
          const normalizedExistingUrl = normalizeUrl(existingJm.url);
          const normalizedExistingSource = normalizeUrl(existingJm.sourceUrl || '');
          
          return (normalizedExistingUrl === normalizedImportUrl && 
                  normalizedExistingSource === normalizedSourceUrl);
        });
        
        if (exists) {
          skippedCount++;
        } else {
          newCount++;
        }
      } catch (error) {
        console.error('URL正規化エラー（プレビュー）:', importJm, error);
        skippedCount++;
      }
    });
  } else {
    newCount = importJumpmarks.length;
  }
  
  // プレビュー表示
  document.getElementById('previewTotal').textContent = importJumpmarks.length;
  document.getElementById('previewNew').textContent = newCount;
  document.getElementById('previewSkipped').textContent = skippedCount;
  
  const importPreview = document.getElementById('importPreview');
  if (importPreview) {
    importPreview.style.display = 'block';
  }
}

// インポート実行
async function executeImport() {
  try {
    if (!importData) {
      showStatusMessage('インポートするファイルが選択されていません', 'error');
      return;
    }
    
    const importMerge = document.getElementById('importMerge');
    const importSkipDuplicates = document.getElementById('importSkipDuplicates');
    
    const mergeMode = importMerge?.checked || false;
    const skipDuplicates = importSkipDuplicates?.checked || false;
    
    showIEStatus('⏳', 'インポート実行中...', '');
    
    const importJumpmarks = importData.jumpmarks || [];
    let processedCount = 0;
    let skippedCount = 0;
    
    // 既存データの処理
    let newAllJumpmarks = mergeMode ? [...allJumpmarks] : [];
    
    for (const importJm of importJumpmarks) {
      try {
        if (skipDuplicates && mergeMode) {
          // 重複チェック（URL正規化エラーをキャッチ）
          const normalizedImportUrl = normalizeUrl(importJm.url);
          const normalizedSourceUrl = normalizeUrl(importJm.sourceUrl || '');
        
          const exists = newAllJumpmarks.some(existingJm => {
            const normalizedExistingUrl = normalizeUrl(existingJm.url);
            const normalizedExistingSource = normalizeUrl(existingJm.sourceUrl || '');
            
            return (normalizedExistingUrl === normalizedImportUrl && 
                    normalizedExistingSource === normalizedSourceUrl);
          });
          
          if (exists) {
            skippedCount++;
            continue;
          }
        }
        
        // IDの重複を避け、古いフラグをクリーンアップ
        const newJumpmark = {
          ...importJm,
          id: generateUniqueId(),
          created: importJm.created || new Date().toISOString()
        };
        
        // 古いbidirectionalフラグを削除（Phase2で廃止済み）
        delete newJumpmark.bidirectional;
        
        newAllJumpmarks.push(newJumpmark);
        processedCount++;
        
      } catch (error) {
        console.error('Jumpmarkインポートエラー:', importJm, error);
        skippedCount++;
        continue;
      }
    }
    
    // ストレージに保存
    await saveJumpmarksToStorage(newAllJumpmarks);
    
    // UIを更新
    await loadJumpmarks();
    
    showIEStatus('✅', 'インポート完了', 
      `${processedCount}件のJumpmarkをインポートしました${skippedCount > 0 ? `（${skippedCount}件をスキップ）` : ''}`);
    
    // インポート関連UIをリセット
    resetImportUI();
    
    setTimeout(hideIEStatus, 3000);
    
  } catch (error) {
    console.error('インポートエラー:', error);
    showIEStatus('❌', 'インポートエラー', error.message);
    setTimeout(hideIEStatus, 5000);
  }
}

// インポートキャンセル
function cancelImport() {
  resetImportUI();
}

// インポートUIをリセット
function resetImportUI() {
  importFile = null;
  importData = null;
  
  const importFileInput = document.getElementById('importFile');
  if (importFileInput) {
    importFileInput.value = '';
  }
  
  const importOptions = document.getElementById('importOptions');
  const importPreview = document.getElementById('importPreview');
  
  if (importOptions) importOptions.style.display = 'none';
  if (importPreview) importPreview.style.display = 'none';
}

// ユニークIDを生成
function generateUniqueId() {
  return 'jm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Jumpmarksをストレージに保存（フラット構造）
async function saveJumpmarksToStorage(jumpmarks) {
  const jumpmarksByUrl = {};
  
  jumpmarks.forEach(jm => {
    const normalizedSourceUrl = normalizeUrl(jm.sourceUrl);
    if (!jumpmarksByUrl[normalizedSourceUrl]) {
      jumpmarksByUrl[normalizedSourceUrl] = [];
    }
    jumpmarksByUrl[normalizedSourceUrl].push(jm);
  });
  
  await chrome.storage.sync.set({ jumpmarks: jumpmarksByUrl });
}

// I/Eステータスを表示
function showIEStatus(icon, message, progress) {
  const ieStatus = document.getElementById('ieStatus');
  const statusIcon = document.getElementById('statusIcon');
  const statusMessage = document.getElementById('statusMessage');
  const statusProgress = document.getElementById('statusProgress');
  
  if (ieStatus && statusIcon && statusMessage && statusProgress) {
    statusIcon.textContent = icon;
    statusMessage.textContent = message;
    statusProgress.textContent = progress;
    ieStatus.style.display = 'block';
  }
}

// I/Eステータスを非表示
function hideIEStatus() {
  const ieStatus = document.getElementById('ieStatus');
  if (ieStatus) {
    ieStatus.style.display = 'none';
  }
}