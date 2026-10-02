// グローバル変数
let currentTab = null;
let currentUrl = "";
let editingJumpmark = null;
let editingHasInitialPartner = false;
let wasWildcard = false;
let savedCheckedBeforeWildcard = true;

// DOM要素
const mainView = document.getElementById("mainView");
const formView = document.getElementById("formView");
const currentUrlDiv = document.getElementById("currentUrl");
const jumpmarksContainer = document.getElementById("jumpmarksContainer");
const emptyState = document.getElementById("emptyState");
const addButton = document.getElementById("addButton");
const backButton = document.getElementById("backButton");
const cancelButton = document.getElementById("cancelButton");
const jumpmarkForm = document.getElementById("jumpmarkForm");
const formTitle = document.getElementById("formTitle");

// アコーディオン要素
const advancedAccordion = document.getElementById("advancedAccordion");
const accordionHeader = document.getElementById("accordionHeader");
const sourceUrlPattern = document.getElementById("sourceUrlPattern");
const wildcardNotice = document.getElementById("wildcardNotice");

// タブピッカー要素
const tabPickerAccordion = document.getElementById("tabPickerAccordion");
const tabPickerHeader = document.getElementById("tabPickerHeader");
const tabPickerList = document.getElementById("tabPickerList");

// 初期化
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await init();
    setupThemeDetection();
  } catch (error) {
    console.error("初期化エラー:", error);
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
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab;
  } catch (error) {
    console.error("タブ情報取得エラー:", error);
    return null;
  }
}

// popup.jsで使っていたローカルなnormalizeUrlは削除し、shared.jsの共通関数を使用します。

// 現在のURLを表示
function displayCurrentUrl() {
  if (currentTab) {
    const displayUrl =
      currentTab.url.length > 50
        ? currentTab.url.substring(0, 47) + "..."
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
    console.error("Jumpmarks表示エラー:", error);
    showEmptyState();
  }
}

// getJumpmarksForUrlは削除し、shared.jsの共通関数を使用します。

// 空状態を表示
function showEmptyState() {
  jumpmarksContainer.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">⚓</div>
      <p>${t("popupEmptyTitle")}</p>
      <p class="empty-subtitle">${t("popupEmptySubtitle")}</p>
    </div>
  `;
}

// Jumpmarksリストを表示
function showJumpmarksList(jumpmarks) {
  jumpmarksContainer.innerHTML = "";

  jumpmarks.forEach((jumpmark) => {
    const jumpmarkElement = createJumpmarkElement(jumpmark);
    jumpmarksContainer.appendChild(jumpmarkElement);
  });
}

// Jumpmark要素を作成
function createJumpmarkElement(jumpmark) {
  const div = document.createElement("div");
  div.className = "jumpmark-item";
  div.innerHTML = `
    <div class="jumpmark-icon">${escapeHtml(jumpmark.icon || "🔗")}</div>
    <div class="jumpmark-content">
      <div class="jumpmark-title">${escapeHtml(jumpmark.title)}</div>
      <div class="jumpmark-url">${escapeHtml(jumpmark.url)}</div>
    </div>
    <div class="jumpmark-actions">
      <button class="edit-button" data-id="${jumpmark.id}">${t("actionEdit")}</button>
      <button class="delete-button" data-id="${jumpmark.id}">${t("actionDelete")}</button>
    </div>
  `;

  // クリックイベント（ボタン以外）
  div.addEventListener("click", (e) => {
    if (
      !e.target.classList.contains("delete-button") &&
      !e.target.classList.contains("edit-button")
    ) {
      navigateToUrl(jumpmark.url);
    }
  });

  // 編集ボタンのクリックイベント
  const editButton = div.querySelector(".edit-button");
  editButton.addEventListener("click", async (e) => {
    e.stopPropagation();
    await editJumpmark(jumpmark);
  });

  // 削除ボタンのクリックイベント
  const deleteButton = div.querySelector(".delete-button");
  deleteButton.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteJumpmarkAndRefresh(jumpmark.id);
  });

  return div;
}

// HTMLエスケープ
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// URLに移動（同一URLのタブがあればフォーカス、なければ新タブ作成）
async function navigateToUrl(url) {
  try {
    // 全てのタブを取得
    const tabs = await chrome.tabs.query({});

    // 完全に同じURLのタブを探す
    const exactTab = tabs.find((tab) => {
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
        active: true,
      });
    }

    window.close();
  } catch (error) {
    console.error("ナビゲーションエラー:", error);
    // エラーが発生した場合は従来通り新しいタブで開く
    try {
      await chrome.tabs.create({ url: url });
      window.close();
    } catch (fallbackError) {
      console.error("フォールバックナビゲーションエラー:", fallbackError);
    }
  }
}

// 開いているタブの一覧を取得して表示（一覧を開いたときだけ呼ばれる）
async function loadTabPickerList() {
  try {
    const tabs = await chrome.tabs.query({});
    renderTabPickerList(filterSelectableTabs(tabs, currentTab));
  } catch (error) {
    console.error("タブ一覧取得エラー:", error);
    showTabPickerMessage(t("popupTabPickerError"));
  }
}

// タブ一覧を描画（タイトル・URLは外部由来なので textContent で設定する）
function renderTabPickerList(selectableTabs) {
  tabPickerList.innerHTML = "";

  if (selectableTabs.length === 0) {
    showTabPickerMessage(t("popupTabPickerEmpty"));
    return;
  }

  selectableTabs.forEach((tab) => {
    tabPickerList.appendChild(createTabPickerItem(tab));
  });
}

// タブ一覧の1行を作成
function createTabPickerItem(tab) {
  const item = document.createElement("div");
  item.className = "tab-picker-item";

  const title = document.createElement("div");
  title.className = "tab-picker-title";
  title.textContent = tab.title || tab.url;

  const url = document.createElement("div");
  url.className = "tab-picker-url";
  url.textContent = tab.url;

  item.appendChild(title);
  item.appendChild(url);
  item.addEventListener("click", () => selectTabForForm(tab));

  return item;
}

// タブ一覧の領域にメッセージを1つ表示
function showTabPickerMessage(message) {
  tabPickerList.innerHTML = "";

  const div = document.createElement("div");
  div.className = "tab-picker-message";
  div.textContent = message;
  tabPickerList.appendChild(div);
}

// 選んだタブの情報をフォームに入力して一覧を閉じる
function selectTabForForm(tab) {
  document.getElementById("jumpmarkTitle").value = tab.title || tab.url;
  document.getElementById("jumpmarkUrl").value = tab.url;
  tabPickerAccordion.classList.remove("open");
}

// 戻りの Jumpmark のタイトルを作る。作成元が今のタブと一致しないときは null
function buildReverseTitle(tab, sourcePattern) {
  if (!tab) return null;
  if (normalizeUrl(sourcePattern) !== normalizeUrl(tab.url)) return null;
  const title = (tab.title ?? "").trim();
  return `← ${title || normalizeUrl(sourcePattern)}`;
}

// shared.js の deleteJumpmark で削除し、成功したら一覧を再表示する
async function deleteJumpmarkAndRefresh(jumpmarkId) {
  try {
    await deleteJumpmark(jumpmarkId);
    await displayJumpmarks();
  } catch (error) {
    // 対象が既に無い場合は何もしない
    if (isJumpmarkNotFoundError(error)) return;
    console.error("Jumpmark削除エラー:", error);
    alert(t("popupErrorDeleteFailed"));
  }
}

// saveJumpmark, updateJumpmark, generateIdは削除し、shared.jsの共通関数を使用します。

// 追加フォームの容量警告。古い取得結果が後から反映されないよう、呼び出しごとに世代を進める
let storageWarningRequestId = 0;

function hideStorageWarning() {
  const warning = document.getElementById("storageWarning");
  if (warning) warning.classList.add("hidden");
}

async function updateStorageWarning() {
  const requestId = ++storageWarningRequestId;
  hideStorageWarning();
  try {
    const bytesUsed = await readStorageUsageBytes();
    // 新しい要求や編集フォームへの切り替えがあった場合は結果を捨てる
    if (requestId !== storageWarningRequestId || editingJumpmark) return;

    const percent = calculateStorageUsagePercent(bytesUsed);
    if (getStorageUsageLevel(percent) === "danger") {
      const warning = document.getElementById("storageWarning");
      warning.textContent = t("popupStorageAlmostFull", [
        String(Math.floor(percent)),
      ]);
      warning.classList.remove("hidden");
    }
  } catch (error) {
    console.error("容量警告の更新エラー:", error);
  }
}

// ビューを切り替え
function showFormView() {
  mainView.classList.add("hidden");
  formView.classList.remove("hidden");

  const iconFormGroup = document.getElementById("iconFormGroup");
  if (iconFormGroup) {
    iconFormGroup.classList.add("hidden");
  }

  // フォームタイトルを変更
  formTitle.textContent = t("popupFormTitleNew");

  // フォームをリセット
  jumpmarkForm.reset();

  // セッションとUI状態のリセット
  resetEditSessionState();
  updateWildcardUi(false, true);

  // アコーディオンの状態をリセット
  advancedAccordion.classList.remove("open");

  // タブピッカーを初期状態（表示・閉じた状態・空）に戻す
  tabPickerAccordion.classList.remove("hidden", "open");
  tabPickerList.innerHTML = "";

  // 現在のURLをパターン初期値に設定
  if (currentTab) {
    sourceUrlPattern.value = currentTab.url;
  }

  // 容量が逼迫していれば警告を出す（フォーム表示は待たせない）
  updateStorageWarning();
}

function showMainView() {
  storageWarningRequestId++;
  formView.classList.add("hidden");
  mainView.classList.remove("hidden");

  // 編集状態をリセット
  resetEditSessionState();
}

// Jumpmarkを編集
async function editJumpmark(jumpmark) {
  editingJumpmark = jumpmark;

  // 新規フォームの警告を残さず、進行中の取得結果も捨てる
  storageWarningRequestId++;
  hideStorageWarning();

  const iconFormGroup = document.getElementById("iconFormGroup");
  if (iconFormGroup) {
    iconFormGroup.classList.remove("hidden");
  }

  // 編集モードではタブピッカーを表示しない
  tabPickerAccordion.classList.add("hidden");

  // フォームタイトルを変更
  formTitle.textContent = t("editJumpmarkTitle");

  // フォームに既存データを入力
  document.getElementById("jumpmarkTitle").value = jumpmark.title;
  document.getElementById("jumpmarkUrl").value = jumpmark.url;
  document.getElementById("jumpmarkIcon").value = jumpmark.icon || "";

  // 双方向判定（動的なパートナー検出を使用）
  const partner = await findBidirectionalPartner(jumpmark);
  editingHasInitialPartner = !!partner;

  // アコーディオンのセット
  sourceUrlPattern.value = jumpmark.sourceUrl || currentUrl;
  const initialIsWildcard = sourceUrlPattern.value.endsWith("*");

  // 状態の計算・保持
  wasWildcard = initialIsWildcard;
  savedCheckedBeforeWildcard = editingHasInitialPartner;

  // アスタリスクが存在すればアコーディオンを開きチェックボックスを無効化
  if (initialIsWildcard) {
    advancedAccordion.classList.add("open");
  } else {
    advancedAccordion.classList.remove("open");
  }

  // UI反映
  updateWildcardUi(initialIsWildcard, editingHasInitialPartner);

  // フォーム画面を表示
  mainView.classList.add("hidden");
  formView.classList.remove("hidden");
}

// イベントリスナーの設定
function setupEventListeners() {
  // 追加ボタン
  addButton.addEventListener("click", showFormView);

  // 戻るボタン
  backButton.addEventListener("click", showMainView);

  // キャンセルボタン
  cancelButton.addEventListener("click", showMainView);

  // アコーディオンヘッダークリックでトグル
  accordionHeader.addEventListener("click", () => {
    advancedAccordion.classList.toggle("open");
  });

  // タブピッカーのヘッダークリック（開いたときだけタブ一覧を取得）
  tabPickerHeader.addEventListener("click", () => {
    const isOpen = tabPickerAccordion.classList.toggle("open");
    if (isOpen) {
      loadTabPickerList();
    }
  });

  // カスタムURLパターンのリアルタイム監視（双方向チェックボックス連動）
  sourceUrlPattern.addEventListener("input", () => {
    const val = sourceUrlPattern.value.trim();
    const isWildcard = val.endsWith("*");
    const bidirectionalCheckbox = document.getElementById("bidirectional");

    // 状態遷移の計算
    let shouldUpdateChecked = false;
    if (isWildcard) {
      if (!wasWildcard) {
        savedCheckedBeforeWildcard = bidirectionalCheckbox.checked;
      }
      wasWildcard = true;
      shouldUpdateChecked = true; // ワイルドカード設定時は一律 checked=false とする
    } else {
      if (wasWildcard) {
        shouldUpdateChecked = true; // ワイルドカード ➔ 通常 URL 遷移時のみ退避状態を復元する
      }
      wasWildcard = false;
    }

    // UIへの反映
    updateWildcardUi(
      isWildcard,
      savedCheckedBeforeWildcard,
      shouldUpdateChecked,
    );
  });

  // フォーム送信
  jumpmarkForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(jumpmarkForm);
    const sourcePattern = sourceUrlPattern.value.trim() || currentTab.url;

    const jumpmarkData = {
      title:
        formData.get("jumpmarkTitle") ||
        document.getElementById("jumpmarkTitle").value,
      url:
        formData.get("jumpmarkUrl") ||
        document.getElementById("jumpmarkUrl").value,
      icon: editingJumpmark
        ? formData.get("jumpmarkIcon") ||
          document.getElementById("jumpmarkIcon").value ||
          editingJumpmark.icon ||
          "🔖"
        : "🔖",
      createBidirectional: document.getElementById("bidirectional").checked,
      sourceUrl: sourcePattern,
    };

    // 戻りの Jumpmark のタイトルは作成元ページ（今のタブ）のタイトルにする。
    // 既存の戻りがある編集では、そのタイトルを保つため渡さない
    if (
      jumpmarkData.createBidirectional &&
      (!editingJumpmark || !editingHasInitialPartner)
    ) {
      const reverseTitle = buildReverseTitle(currentTab, sourcePattern);
      if (reverseTitle !== null) jumpmarkData.reverseTitle = reverseTitle;
    }

    // 基本的なバリデーション
    if (!jumpmarkData.title || !jumpmarkData.url) {
      alert(t("popupErrorTitleUrlRequired"));
      return;
    }

    try {
      new URL(jumpmarkData.url);
    } catch {
      alert(t("errorInvalidUrl"));
      return;
    }

    // 防御的バリデーション（ホスト名長さ、中間アスタリスクなど）
    const validationResult = validateSourceUrlPattern(sourcePattern);
    if (!validationResult.valid) {
      alert(validationResult.message);
      sourceUrlPattern.focus();
      return;
    }

    let success = false;
    let quotaError = false;
    try {
      if (editingJumpmark) {
        // 編集モード (shared.jsのupdateJumpmarkを呼ぶ)
        success = await updateJumpmark(editingJumpmark.id, jumpmarkData);
      } else {
        // 新規作成モード (shared.jsのsaveJumpmarkを呼ぶ)
        const saved = await saveJumpmark(jumpmarkData);
        success = !!saved;
      }
    } catch (err) {
      console.error(err);
      quotaError = isStorageQuotaError(err);
    }

    if (success) {
      showMainView();
      await displayJumpmarks();
    } else if (quotaError) {
      alert(t("errorStorageQuotaExceeded"));
    } else {
      alert(
        editingJumpmark
          ? t("popupErrorUpdateFailed")
          : t("popupErrorSaveFailed"),
      );
    }
  });
}

// テーマ検出とスタイル切り替え
function setupThemeDetection() {
  // システムテーマの初期検出
  const darkModeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  applyTheme(darkModeMediaQuery.matches);

  // テーマ変更の監視
  darkModeMediaQuery.addEventListener("change", (e) => {
    applyTheme(e.matches);
  });
}

function applyTheme(isDark) {
  const body = document.body;

  if (isDark) {
    body.setAttribute("data-theme", "dark");
  } else {
    body.removeAttribute("data-theme");
  }

  // アイコンの切り替えは不要なので、メッセージ送信は削除
}

/**
 * 双方向チェックボックスと注意表示の DOM 状態を一括更新する (UI反映関数)
 * @param {boolean} isWildcard ワイルドカードパターンかどうか
 * @param {boolean} savedChecked 退避されているチェックボックスの checked 状態（isWildcardがfalseかつupdateCheckedStateがtrueの時のみ反映される）
 * @param {boolean} updateCheckedState checked 状態を更新するかどうか (通常入力時は false を指定し、ユーザーの手動選択を保持)
 */
function updateWildcardUi(isWildcard, savedChecked, updateCheckedState = true) {
  const bidirectionalCheckbox = document.getElementById("bidirectional");
  const wildcardNotice = document.getElementById("wildcardNotice");

  if (isWildcard) {
    bidirectionalCheckbox.checked = false;
    bidirectionalCheckbox.disabled = true;
    wildcardNotice.classList.remove("hidden");
  } else {
    bidirectionalCheckbox.disabled = false;
    wildcardNotice.classList.add("hidden");
    if (updateCheckedState) {
      bidirectionalCheckbox.checked = savedChecked;
    }
  }
}

/**
 * 編集セッションの状態（編集対象データ、退避フラグ等）をすべて初期値に戻す (状態操作)
 */
function resetEditSessionState() {
  editingJumpmark = null;
  editingHasInitialPartner = false;
  wasWildcard = false;
  savedCheckedBeforeWildcard = true;
}
