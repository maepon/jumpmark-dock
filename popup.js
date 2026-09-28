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
    deleteJumpmark(jumpmark.id);
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

async function deleteJumpmark(jumpmarkId) {
  try {
    const result = await chrome.storage.sync.get(["jumpmarks"]);
    const allJumpmarks = result.jumpmarks || {};

    let found = false;
    for (const key in allJumpmarks) {
      const initialLength = allJumpmarks[key].length;
      allJumpmarks[key] = allJumpmarks[key].filter(
        (jumpmark) => jumpmark.id !== jumpmarkId,
      );

      if (allJumpmarks[key].length !== initialLength) {
        found = true;
        if (allJumpmarks[key].length === 0) {
          delete allJumpmarks[key];
        }
        break; // IDは一意なので見つかったらループ終了
      }
    }

    if (found) {
      await chrome.storage.sync.set({ jumpmarks: allJumpmarks });
      await displayJumpmarks();
    }
  } catch (error) {
    console.error("Jumpmark削除エラー:", error);
  }
}

// saveJumpmark, updateJumpmark, generateIdは削除し、shared.jsの共通関数を使用します。

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

  // 現在のURLをパターン初期値に設定
  if (currentTab) {
    sourceUrlPattern.value = currentTab.url;
  }
}

function showMainView() {
  formView.classList.add("hidden");
  mainView.classList.remove("hidden");

  // 編集状態をリセット
  resetEditSessionState();
}

// Jumpmarkを編集
async function editJumpmark(jumpmark) {
  editingJumpmark = jumpmark;

  const iconFormGroup = document.getElementById("iconFormGroup");
  if (iconFormGroup) {
    iconFormGroup.classList.remove("hidden");
  }

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
    }

    if (success) {
      showMainView();
      await displayJumpmarks();
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
