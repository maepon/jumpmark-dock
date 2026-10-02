// 容量表示・容量不足エラーの UI 経路（options.js / popup.js）を、DOM と chrome のスタブ越しに確かめる
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  readSource,
  createSyncStub,
  buildItems,
} = require("./helpers/sync-stub");

// 1 項目の上限（これ以上の title を 1 件入れると 1 項目に収まらない）
const QUOTA = 8192;

function createElementStub() {
  const classes = new Set();
  const attributes = new Map();
  const handlers = {};
  return {
    classList: {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      contains: (name) => classes.has(name),
    },
    style: {},
    textContent: "",
    innerHTML: "",
    value: "",
    checked: false,
    disabled: false,
    handlers,
    focus() {},
    reset() {},
    setAttribute: (name, value) => attributes.set(name, String(value)),
    getAttribute: (name) =>
      attributes.has(name) ? attributes.get(name) : null,
    addEventListener: (type, handler) => {
      handlers[type] = handler;
    },
  };
}

// shared.js -> i18n.js -> 対象 JS を HTML と同じ順で読み込む。
// t() の結果が検証できるよう、chrome.i18n は「キー:引数」を返すスタブにする
function loadSandbox(target, stored) {
  const elements = new Map();
  const stub = createSyncStub(stored ? buildItems(stored) : {});
  const calls = { set: stub.state.setCalls, alert: [] };
  const sandbox = {
    console: { ...console, error: () => {} },
    URL,
    TextEncoder,
    setTimeout: () => 0,
    alert: (message) => calls.alert.push(message),
    FormData: class {
      get() {
        return null;
      }
    },
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }) },
    document: {
      createElement: createElementStub,
      getElementById: (id) => {
        if (!elements.has(id)) elements.set(id, createElementStub());
        return elements.get(id);
      },
      querySelectorAll: () => [],
      addEventListener: () => {},
      documentElement: {},
    },
    chrome: {
      i18n: {
        getMessage: (key, subs) =>
          subs === undefined ? key : `${key}:${[].concat(subs).join("|")}`,
      },
      storage: { sync: stub.sync },
    },
  };
  vm.createContext(sandbox);
  for (const file of ["shared.js", "i18n.js", target]) {
    vm.runInContext(readSource(file), sandbox);
  }
  sandbox.generateUniqueId = () => "fixed-id";
  return {
    sandbox,
    calls,
    state: stub.state,
    el: sandbox.document.getElementById,
  };
}

// 全項目の合計がちょうど bytes になる storage.sync の項目群（"jm:7" の 4 + {"d":{"a.com":[{"title":"…"}]}} の 30 + 文字数）
const itemsWithBytes = (bytes) => ({
  "jm:7": { d: { "a.com": [{ title: "x".repeat(bytes - 34) }] } },
});

const tick = () => new Promise((resolve) => setImmediate(resolve));

// ---- options.js ----

test("AC-45: updateStorageStats thresholds (summary, bar, warning)", async () => {
  const { sandbox, el } = loadSandbox("options.js", {});
  const statuses = [];
  sandbox.showStatusMessage = (...args) => statuses.push(args);
  const bar = el("storageProgress");
  const summary = el("storageSummary");
  const run = async (bytes) => {
    sandbox.chrome.storage.sync.get = async () => itemsWithBytes(bytes);
    await sandbox.updateStorageStats();
  };

  await run(51200);
  assert.strictEqual(summary.textContent, "storageSummary:1|50.0KB|100.0KB");
  assert.strictEqual(bar.style.width, "50%");
  assert.strictEqual(bar.classList.contains("warning"), false);
  assert.strictEqual(bar.classList.contains("danger"), false);

  await run(71680); // 70%
  assert.strictEqual(bar.style.width, "70%");
  assert.strictEqual(bar.classList.contains("warning"), true);
  assert.strictEqual(bar.classList.contains("danger"), false);

  await run(51200);
  assert.strictEqual(bar.classList.contains("warning"), false);

  await run(92160); // 90%
  assert.strictEqual(bar.classList.contains("danger"), true);
  assert.strictEqual(bar.classList.contains("warning"), false);
  assert.strictEqual(statuses.length, 0);

  await run(97280); // 95%
  assert.strictEqual(bar.classList.contains("danger"), true);
  assert.deepStrictEqual(statuses, [["warnStorageAlmostFull", "error"]]);
});

test("updateStorageStats falls back on getStorageStats failure", async () => {
  const { sandbox, el } = loadSandbox("options.js", {});
  sandbox.getStorageStats = async () => {
    throw new Error("boom");
  };
  el("storageProgress").style.width = "50%";
  await sandbox.updateStorageStats();
  assert.strictEqual(el("storageSummary").textContent, "storageSummary:-|-|-");
  assert.strictEqual(el("storageProgress").style.width, "0%");
});

test("AC-37: saveJumpmarksToStorage rejects over quota without calling set", async () => {
  const { sandbox, calls } = loadSandbox("options.js", {});
  const jumpmarks = [{ title: "x".repeat(QUOTA), sourceUrl: "a.com" }];
  await assert.rejects(sandbox.saveJumpmarksToStorage(jumpmarks), (error) =>
    sandbox.isStorageQuotaError(error),
  );
  assert.strictEqual(calls.set.length, 0);
});

test("saveJumpmarksToStorage saves when small", async () => {
  const { sandbox, calls } = loadSandbox("options.js", {});
  await sandbox.saveJumpmarksToStorage([{ title: "t", sourceUrl: "a.com" }]);
  assert.strictEqual(calls.set.length, 1);
  assert.deepStrictEqual(calls.set[0], {
    "jm:7": { d: { "a.com": [{ title: "t", sourceUrl: "a.com" }] } },
    "jm:meta": { v: 2, legacyIds: [] },
  });
});

test("saveJumpmarksToStorage saves when the bucket item is exactly 8192 bytes", async () => {
  const { sandbox, calls } = loadSandbox("options.js", {});
  const build = (padding) => [
    { title: "x".repeat(padding), sourceUrl: "a.com" },
  ];
  const base = sandbox.calculateStorageItemBytes("jm:7", {
    d: { "a.com": build(0) },
  });
  await sandbox.saveJumpmarksToStorage(build(QUOTA - base));
  assert.strictEqual(calls.set.length, 1);
  assert.strictEqual(
    sandbox.calculateStorageItemBytes("jm:7", calls.set[0]["jm:7"]),
    QUOTA,
  );
});

test("AC-36: saveJumpmarksToStorage across multiple buckets uses at most one set and one remove", async () => {
  const item = (id, sourceUrl) => ({
    id,
    title: id,
    url: "https://t.com",
    sourceUrl,
  });
  // a.com(7) / b.com(2) は残して内容を変え、d.com のバケットは空にする
  const { sandbox, calls, state } = loadSandbox("options.js", {
    "a.com": [item("old-a", "a.com")],
    "b.com": [item("old-b", "b.com")],
    "d.com": [item("old-d", "d.com")],
  });
  const next = [item("new-a", "a.com"), item("new-b", "b.com")];
  await sandbox.saveJumpmarksToStorage(next);
  assert.ok(calls.set.length <= 1);
  assert.ok(state.removeCalls.length <= 1);
  assert.ok("jm:7" in calls.set[0] && "jm:2" in calls.set[0]);
  assert.strictEqual(state.removeCalls.length, 1);
  const stored = await sandbox.readJumpmarksStore();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(stored)), {
    "a.com": [next[0]],
    "b.com": [next[1]],
  });
});

// 編集フォームを有効な値で埋め、既存 1 件（id: u1）が保存されている状態にする
function setupEditForm(title) {
  const ctx = loadSandbox("options.js", {
    "a.com": [
      { id: "u1", title: "t", url: "https://t.com", sourceUrl: "a.com" },
    ],
  });
  const { sandbox, el } = ctx;
  const errors = [];
  sandbox.showEditError = (message) => errors.push(message);
  sandbox.clearEditError = () => {};
  sandbox.showStatusMessage = () => {};
  sandbox.closeEditModal = () => {};
  el("editTitle").value = title;
  el("editUrl").value = "https://t.com";
  el("editIcon").value = "🔗";
  el("editSourceUrl").value = "a.com";
  el("editModal").setAttribute("data-editing-id", "u1");
  return { ...ctx, errors };
}

test("edit form shows quota message on quota error", async () => {
  const { sandbox, calls, errors } = setupEditForm("x".repeat(QUOTA));
  await sandbox.handleEditFormSubmit({ preventDefault() {} });
  assert.deepStrictEqual(errors, ["errorStorageQuotaExceeded"]);
  assert.strictEqual(calls.set.length, 0);
});

test("edit form keeps detailed message on other errors", async () => {
  const { sandbox, errors } = setupEditForm("new title");
  sandbox.chrome.storage.sync.set = async () => {
    throw new Error("boom");
  };
  await sandbox.handleEditFormSubmit({ preventDefault() {} });
  assert.deepStrictEqual(errors, ["errorUpdateFailedDetail:boom"]);
});

function setupImport(title) {
  const ctx = loadSandbox("options.js", {});
  const { sandbox } = ctx;
  const statuses = [];
  sandbox.showIEStatus = (...args) => statuses.push(args);
  sandbox.loadJumpmarks = async () => {};
  sandbox.resetImportUI = () => {};
  vm.runInContext(
    `allJumpmarks = []; importData = ${JSON.stringify({
      jumpmarks: [{ title, url: "https://t.com", sourceUrl: "a.com" }],
    })};`,
    sandbox,
  );
  return { ...ctx, statuses };
}

test("import shows quota message on quota error", async () => {
  const { sandbox, calls, statuses } = setupImport("x".repeat(QUOTA));
  await sandbox.executeImport();
  assert.deepStrictEqual(statuses[statuses.length - 1], [
    "❌",
    "errorImport",
    "errorStorageQuotaExceeded",
  ]);
  assert.strictEqual(calls.set.length, 0);
});

test("import keeps error.message on other errors", async () => {
  const { sandbox, statuses } = setupImport("t");
  sandbox.chrome.storage.sync.set = async () => {
    throw new Error("boom");
  };
  await sandbox.executeImport();
  assert.deepStrictEqual(statuses[statuses.length - 1], [
    "❌",
    "errorImport",
    "boom",
  ]);
});

// ---- popup.js ----

function setupPopupSubmit({ editing }) {
  const ctx = loadSandbox("popup.js", {});
  const { sandbox, el } = ctx;
  const mainViewCalls = [];
  sandbox.showMainView = () => mainViewCalls.push("showMainView");
  sandbox.displayJumpmarks = async () => {};
  el("sourceUrlPattern").value = "https://a.com";
  el("jumpmarkTitle").value = "title";
  el("jumpmarkUrl").value = "https://t.com";
  vm.runInContext(
    `currentTab = { url: "https://a.com" }; editingJumpmark = ${
      editing ? '{ id: "u1", icon: "x" }' : "null"
    };`,
    sandbox,
  );
  sandbox.setupEventListeners();
  const submit = el("jumpmarkForm").handlers.submit;
  return {
    ...ctx,
    mainViewCalls,
    submit: () => submit({ preventDefault() {} }),
  };
}

test("popup submit shows quota alert and keeps form open", async () => {
  for (const editing of [false, true]) {
    const { sandbox, calls, mainViewCalls, submit } = setupPopupSubmit({
      editing,
    });
    const quotaError = sandbox.createStorageQuotaError();
    sandbox.saveJumpmark = async () => {
      throw quotaError;
    };
    sandbox.updateJumpmark = async () => {
      throw quotaError;
    };
    await submit();
    assert.deepStrictEqual(calls.alert, ["errorStorageQuotaExceeded"]);
    assert.deepStrictEqual(mainViewCalls, []);
  }
});

test("popup submit shows generic alert for other failures (edit / new)", async () => {
  for (const editing of [false, true]) {
    const { sandbox, calls, mainViewCalls, submit } = setupPopupSubmit({
      editing,
    });
    const fail = async () => {
      throw new Error("boom");
    };
    sandbox.saveJumpmark = fail;
    sandbox.updateJumpmark = fail;
    await submit();
    assert.deepStrictEqual(calls.alert, [
      editing ? "popupErrorUpdateFailed" : "popupErrorSaveFailed",
    ]);
    assert.deepStrictEqual(mainViewCalls, []);
  }
});

test("popup submit closes form on success", async () => {
  for (const editing of [false, true]) {
    const { sandbox, calls, mainViewCalls, submit } = setupPopupSubmit({
      editing,
    });
    sandbox.saveJumpmark = async () => ({ id: "n1" });
    sandbox.updateJumpmark = async () => true;
    await submit();
    assert.deepStrictEqual(calls.alert, []);
    assert.deepStrictEqual(mainViewCalls, ["showMainView"]);
  }
});

test("popup deleteJumpmarkAndRefresh alerts on failure", async () => {
  const { sandbox, calls } = loadSandbox("popup.js", {});
  sandbox.chrome.storage.sync.get = async () => {
    throw new Error("boom");
  };
  await sandbox.deleteJumpmarkAndRefresh("u1");
  assert.deepStrictEqual(calls.alert, ["popupErrorDeleteFailed"]);
});

test("popup deleteJumpmarkAndRefresh does not check quota", async () => {
  // 容量超過の保存済みデータでも、削除は set まで進み alert を出さない
  const stored = {
    "b.com": Array.from({ length: 14 }, (_, i) => ({
      id: `big${i}`,
      title: "x".repeat(8000),
    })),
    "a.com": [{ id: "d1", title: "t" }],
  };
  const { sandbox, calls } = loadSandbox("popup.js", stored);
  sandbox.displayJumpmarks = async () => {};
  await sandbox.deleteJumpmarkAndRefresh("d1");
  assert.strictEqual(calls.set.length, 1);
  assert.deepStrictEqual(calls.alert, []);
});

function setupPopupForm(percentOrError) {
  const ctx = loadSandbox("popup.js", {});
  const { sandbox, el } = ctx;
  const errors = [];
  sandbox.console = { ...console, error: (...args) => errors.push(args) };
  sandbox.findBidirectionalPartner = async () => null;
  // get を外から解決できる Promise にして、完了のタイミングを制御する
  const pending = [];
  sandbox.chrome.storage.sync.get = () =>
    new Promise((resolve, reject) => pending.push({ resolve, reject }));
  const warning = el("storageWarning");
  warning.classList.add("hidden");
  return {
    ...ctx,
    errors,
    warning,
    pending,
    resolveWith: (index, bytes) =>
      pending[index].resolve(itemsWithBytes(bytes)),
  };
}

test("AC-46: showFormView shows warning at 90% or more", async () => {
  const { sandbox, warning, resolveWith } = setupPopupForm();
  sandbox.showFormView();
  resolveWith(0, 94000); // 約 91.8%
  await tick();
  assert.strictEqual(warning.classList.contains("hidden"), false);
  const percent = (94000 / 102400) * 100;
  assert.strictEqual(
    warning.textContent,
    `popupStorageAlmostFull:${Math.floor(percent)}`,
  );
});

test("showFormView hides warning below 90%", async () => {
  const { sandbox, warning, resolveWith } = setupPopupForm();
  sandbox.showFormView();
  resolveWith(0, 91000); // 約 88.9%
  await tick();
  assert.strictEqual(warning.classList.contains("hidden"), true);
});

test("showFormView hides warning when get fails", async () => {
  const { sandbox, warning, pending, errors } = setupPopupForm();
  sandbox.showFormView();
  pending[0].reject(new Error("boom"));
  await tick();
  assert.strictEqual(warning.classList.contains("hidden"), true);
  assert.strictEqual(errors.length, 1);
});

test("editJumpmark hides warning", async () => {
  const { sandbox, warning } = setupPopupForm();
  warning.classList.remove("hidden");
  await sandbox.editJumpmark({ id: "u1", title: "t", url: "https://t.com" });
  assert.strictEqual(warning.classList.contains("hidden"), true);
});

test("stale warning result does not show on edit form", async () => {
  const { sandbox, warning, resolveWith } = setupPopupForm();
  sandbox.showFormView();
  await sandbox.editJumpmark({ id: "u1", title: "t", url: "https://t.com" });
  resolveWith(0, 97280);
  await tick();
  assert.strictEqual(warning.classList.contains("hidden"), true);
});

test("stale warning result does not show after a newer request", async () => {
  const { sandbox, warning, resolveWith } = setupPopupForm();
  sandbox.showFormView();
  sandbox.showFormView();
  resolveWith(1, 40000); // 新しい要求（90% 未満）が先に完了
  await tick();
  resolveWith(0, 97280); // 古い要求（90% 以上）が後から完了
  await tick();
  assert.strictEqual(warning.classList.contains("hidden"), true);
});
