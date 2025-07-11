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