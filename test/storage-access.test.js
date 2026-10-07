// chrome.storage の入口（shared.js の readJumpmarksStore / writeJumpmarksStore / onJumpmarksChanged）と、
// それを使う background.js / popup.js を、chrome のスタブ越しに確かめる
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  ROOT,
  plain,
  readSource,
  createSyncStub,
  createFakeTimers,
  buildItems,
} = require("./helpers/sync-stub");

// 全体の上限（102,400 バイト）を超える保存済みの項目群（"d1" は小さな削除対象）
const overQuotaItems = () =>
  buildItems({
    "b.com": Array.from({ length: 14 }, (_, i) => ({
      id: `big${i}`,
      title: "x".repeat(8000),
    })),
    "a.com": [{ id: "d1", title: "t" }],
  });

const tick = () => new Promise((resolve) => setImmediate(resolve));

// shared.js は 1 sandbox に 1 回だけ読む（const の再宣言を避ける）
// options.items は storage.sync の項目群、options.stored は { 作成元URL: [Jumpmark] } を新しい形式にしたもの
function createEnv(options = {}) {
  const stub = createSyncStub(
    options.items ?? (options.stored ? buildItems(options.stored) : {}),
  );
  const timers = createFakeTimers();
  const state = Object.assign(stub.state, {
    timers,
    listeners: [],
    log: { error: [], warn: [], log: [] },
    alerts: [],
  });
  const sandbox = {
    console: {
      ...console,
      error: (...a) => state.log.error.push(a),
      warn: (...a) => state.log.warn.push(a),
      log: (...a) => state.log.log.push(a),
    },
    URL,
    TextEncoder,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    alert: (message) => state.alerts.push(message),
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }) },
    document: {
      createElement: options.createElement ?? (() => ({})),
      getElementById: () => ({
        classList: { add() {}, remove() {}, contains: () => false },
        addEventListener() {},
      }),
      querySelectorAll: () => [],
      addEventListener: () => {},
      documentElement: {},
    },
    chrome: {
      i18n: {
        getMessage: (key, subs) =>
          subs === undefined ? key : `${key}:${[].concat(subs).join("|")}`,
      },
      storage: {
        onChanged: {
          addListener: (listener) => state.listeners.push(listener),
        },
        sync: stub.sync,
      },
    },
  };
  vm.createContext(sandbox);
  return {
    sandbox,
    state,
    load: (file) => vm.runInContext(readSource(file), sandbox),
  };
}

function loadShared(options) {
  const env = createEnv(options);
  env.load("shared.js");
  env.load("i18n.js");
  return env;
}

const noLogs = (state) => {
  assert.strictEqual(state.log.error.length, 0);
  assert.strictEqual(state.log.warn.length, 0);
  assert.strictEqual(state.log.log.length, 0);
};

// ---- ソース検査（AC-1〜AC-4, AC-21, AC-23, AC-25） ----

test("root js files other than shared.js do not contain chrome.storage", () => {
  const files = fs
    .readdirSync(ROOT)
    .filter((f) => f.endsWith(".js") && f !== "shared.js");
  for (const name of ["background.js", "popup.js", "options.js", "i18n.js"]) {
    assert.ok(files.includes(name), `${name} should be scanned`);
  }
  for (const file of files) {
    assert.ok(
      !readSource(file).includes("chrome.storage"),
      `${file} must not touch chrome.storage directly`,
    );
  }
});

// コメント行を除いて pattern を含む行の「直前の function 宣言名」を返す
function enclosingFunctions(source, pattern) {
  const lines = source.split("\n");
  const found = [];
  lines.forEach((line, i) => {
    if (!/^\s*[^/\s]/.test(line) || !pattern.test(line)) return;
    for (let j = i; j >= 0; j--) {
      const m = lines[j].match(/^(?:async )?function (\w+)/);
      if (m) {
        found.push(m[1]);
        return;
      }
    }
    found.push(null);
  });
  return found;
}

test("shared.js has exactly one chrome.storage.sync line inside getJumpmarksStorageArea", () => {
  assert.deepStrictEqual(
    enclosingFunctions(readSource("shared.js"), /chrome\.storage\.sync/),
    ["getJumpmarksStorageArea"],
  );
});

test("shared.js has exactly one chrome.storage.onChanged line inside onJumpmarksChanged", () => {
  assert.deepStrictEqual(
    enclosingFunctions(readSource("shared.js"), /chrome\.storage\.onChanged/),
    ["onJumpmarksChanged"],
  );
});

test("deleteJumpmark is defined only in shared.js", () => {
  const files = fs.readdirSync(ROOT).filter((f) => f.endsWith(".js"));
  const owners = files.filter((f) =>
    /function deleteJumpmark\(/.test(readSource(f)),
  );
  assert.deepStrictEqual(owners, ["shared.js"]);
});

test("background.js and options.js register onJumpmarksChanged once", () => {
  for (const file of ["background.js", "options.js"]) {
    const count = readSource(file).match(/onJumpmarksChanged\(/g) || [];
    assert.strictEqual(count.length, 1, file);
  }
});

test("options.js saveJumpmarksToStorage goes through writeJumpmarksStore", () => {
  const source = readSource("options.js");
  assert.ok(!source.includes("assertWithinStorageQuota"));
  assert.ok(source.includes("writeJumpmarksStore(jumpmarksByUrl)"));
});

test("popup.js calls deleteJumpmarkAndRefresh from the delete button", () => {
  const source = readSource("popup.js");
  assert.ok(source.includes("deleteJumpmarkAndRefresh(jumpmark.id)"));
  assert.ok(!source.includes("deleteJumpmark(jumpmark.id)"));
});

// ---- 入口の関数（AC-5〜AC-14） ----

test("readJumpmarksStore returns stored value with one get call", async () => {
  const stored = { "a.com": [{ id: "1" }] };
  const { sandbox, state } = loadShared({ stored });
  const result = await sandbox.readJumpmarksStore();
  assert.deepStrictEqual(plain(result), stored);
  assert.deepStrictEqual(plain(state.getCalls), [null]);
  assert.strictEqual(state.setCalls.length, 0);
  assert.strictEqual(state.removeCalls.length, 0);
});

test("readJumpmarksStore returns {} when empty", async () => {
  const { sandbox } = loadShared();
  assert.deepStrictEqual(plain(await sandbox.readJumpmarksStore()), {});
});

test("readJumpmarksStore rejects with same error and does not log", async () => {
  const { sandbox, state } = loadShared();
  const err = new Error("boom");
  state.getError = err;
  await assert.rejects(sandbox.readJumpmarksStore(), (e) => e === err);
  noLogs(state);
});

test("writeJumpmarksStore calls set once", async () => {
  const { sandbox, state } = loadShared();
  const data = { "a.com": [{ id: "1", title: "t" }] };
  await sandbox.writeJumpmarksStore(data);
  assert.deepStrictEqual(plain(state.setCalls), [
    {
      "jm:7": { d: data },
      "jm:meta": { v: 2, legacyIds: [] },
    },
  ]);
});

test("writeJumpmarksStore rejects over quota without set or log", async () => {
  const { sandbox, state } = loadShared();
  await assert.rejects(
    sandbox.writeJumpmarksStore({ "a.com": [{ title: "x".repeat(8192) }] }),
    (e) => sandbox.isStorageQuotaError(e) === true,
  );
  assert.strictEqual(state.setCalls.length, 0);
  noLogs(state);
});

test("writeJumpmarksStore with checkQuota false skips quota", async () => {
  const { sandbox, state } = loadShared();
  await sandbox.writeJumpmarksStore(
    { "a.com": [{ title: "x".repeat(8192) }] },
    { checkQuota: false },
  );
  assert.strictEqual(state.setCalls.length, 1);
});

test("writeJumpmarksStore rejects with same error when set fails", async () => {
  const { sandbox, state } = loadShared();
  const err = new Error("set failed");
  state.setError = err;
  await assert.rejects(
    sandbox.writeJumpmarksStore({ "a.com": [{ id: "1" }] }),
    (e) => e === err,
  );
  assert.strictEqual(state.removeCalls.length, 0);
  noLogs(state);
});

test("onJumpmarksChanged registers synchronously", () => {
  const { sandbox, state } = loadShared();
  sandbox.onJumpmarksChanged(() => {});
  assert.strictEqual(state.listeners.length, 1);
});

test("onJumpmarksChanged listener filters area and key, then notifies once after the delay", () => {
  const { sandbox, state } = loadShared();
  const calls = [];
  sandbox.onJumpmarksChanged((...args) => {
    calls.push(args);
  });
  const [listener] = state.listeners;
  const changed = { "jm:7": { newValue: {} } };
  listener(changed, "local");
  listener({ other: { newValue: 1 } }, "sync");
  state.timers.advance(1000);
  assert.strictEqual(calls.length, 0);
  listener(changed, "sync");
  assert.strictEqual(calls.length, 0);
  state.timers.advance(100);
  assert.deepStrictEqual(calls, [[]]);
});

test("isJumpmarkNotFoundError / createJumpmarkNotFoundError", () => {
  const { sandbox } = loadShared();
  const error = sandbox.createJumpmarkNotFoundError();
  assert.strictEqual(sandbox.isJumpmarkNotFoundError(error), true);
  for (const other of [
    new Error("x"),
    null,
    undefined,
    "JumpmarkNotFoundError",
  ]) {
    assert.strictEqual(sandbox.isJumpmarkNotFoundError(other), false);
  }
  assert.strictEqual(error.message, sandbox.t("errorJumpmarkNotFound"));
});

// ---- shared.js の既存関数（AC-15〜AC-19） ----

test("shared.js storage-using functions go through the entry points", () => {
  const { sandbox } = loadShared();
  for (const name of [
    "getJumpmarksForUrl",
    "getAllJumpmarks",
    "saveJumpmark",
    "updateJumpmark",
    "deleteJumpmark",
    "deleteBidirectionalPair",
    "deleteJumpmarks",
    "getStorageStats",
  ]) {
    assert.ok(!sandbox[name].toString().includes("chrome.storage"), name);
  }
});

test("saveJumpmark/updateJumpmark do not call assertWithinStorageQuota directly", () => {
  const { sandbox } = loadShared();
  for (const name of ["saveJumpmark", "updateJumpmark"]) {
    const source = sandbox[name].toString();
    assert.ok(!source.includes("assertWithinStorageQuota"), name);
    assert.ok(source.includes("writeJumpmarksStore"), name);
  }
});

test("delete functions succeed when stored data is over quota", async () => {
  const calls = {
    deleteJumpmark: ["d1"],
    deleteBidirectionalPair: ["d1", "none"],
    deleteJumpmarks: [["d1"]],
  };
  for (const [name, args] of Object.entries(calls)) {
    const { sandbox, state } = loadShared({ items: overQuotaItems() });
    await sandbox[name](...args);
    assert.strictEqual(state.setCalls.length, 1, name);
    assert.ok(!JSON.stringify(state.items).includes('"d1"'), name);
  }
});

test("deleteJumpmark and updateJumpmark reject with not-found error without set", async () => {
  const { sandbox, state } = loadShared({
    stored: { "a.com": [{ id: "d1" }] },
  });
  await assert.rejects(sandbox.deleteJumpmark("nope"), (e) =>
    sandbox.isJumpmarkNotFoundError(e),
  );
  await assert.rejects(sandbox.updateJumpmark("nope", { title: "t" }), (e) =>
    sandbox.isJumpmarkNotFoundError(e),
  );
  assert.strictEqual(state.setCalls.length, 0);
});

test("getJumpmarksForUrl / getAllJumpmarks return [] when get rejects", async () => {
  const { sandbox, state } = loadShared();
  state.getError = new Error("boom");
  assert.deepStrictEqual(
    plain(await sandbox.getJumpmarksForUrl("https://a.com")),
    [],
  );
  assert.deepStrictEqual(plain(await sandbox.getAllJumpmarks()), []);
});

// ---- background.js（AC-20〜AC-22） ----

function loadBackground(stored) {
  const env = createEnv({ stored });
  const badges = [];
  const noopEvent = { addListener() {} };
  Object.assign(env.sandbox, {
    importScripts: (file) => env.load(file),
  });
  Object.assign(env.sandbox.chrome, {
    tabs: {
      onUpdated: noopEvent,
      onActivated: noopEvent,
      query: async () => [{ id: 1, url: "https://a.com/page" }],
      get: async () => ({}),
    },
    action: {
      setBadgeText: async (v) => badges.push(v),
      setBadgeBackgroundColor: async () => {},
    },
    runtime: { onInstalled: noopEvent, onStartup: noopEvent },
  });
  env.load("background.js");
  return { ...env, badges };
}

test("background: rebuildWildcardCache and getJumpmarkCountForUrl read via readJumpmarksStore", async () => {
  const { sandbox, state } = loadBackground({ "a.com*": [{ id: "1" }] });
  await tick();
  state.getCalls.length = 0;
  await sandbox.rebuildWildcardCache();
  assert.deepStrictEqual(plain(state.getCalls), [null]);
  state.getCalls.length = 0;
  assert.strictEqual(
    await sandbox.getJumpmarkCountForUrl("https://a.com/x"),
    1,
  );
  assert.ok(state.getCalls.length >= 1);
  for (const keys of state.getCalls) assert.strictEqual(keys, null);
});

test("background: rebuildWildcardCache resets cache and rethrows on get failure", async () => {
  const { sandbox, state } = loadBackground({ "a.com*": [{ id: "1" }] });
  await tick();
  assert.deepStrictEqual(plain(vm.runInContext("wildcardKeysCache", sandbox)), [
    "a.com*",
  ]);
  const err = new Error("boom");
  state.getError = err;
  await assert.rejects(sandbox.rebuildWildcardCache(), (e) => e === err);
  assert.deepStrictEqual(
    plain(vm.runInContext("wildcardKeysCache", sandbox)),
    [],
  );
});

test("background: storage change rebuilds wildcard cache then updates badges", async () => {
  const { state, badges } = loadBackground({});
  await tick();
  assert.strictEqual(state.listeners.length, 1);

  state.items = buildItems({ "a.com*": [{ id: "1" }, { id: "2" }] });
  state.listeners[0]({ "jm:1": { newValue: {} } }, "sync");
  state.timers.advance(100);
  await tick();
  assert.deepStrictEqual(plain(badges[badges.length - 1]), {
    tabId: 1,
    text: "2",
  });
});

test("AC-42: background listener rebuilds once for a burst of changes", async () => {
  const { sandbox, state } = loadBackground({});
  await tick();
  let queries = 0;
  sandbox.chrome.tabs.query = async () => {
    queries++;
    return [];
  };
  let rebuilds = 0;
  const rebuild = sandbox.rebuildWildcardCache;
  sandbox.rebuildWildcardCache = (...args) => {
    rebuilds++;
    return rebuild(...args);
  };
  for (let i = 0; i < 3; i++) {
    state.listeners[0]({ "jm:7": { newValue: {} } }, "sync");
  }
  state.timers.advance(100);
  await tick();
  assert.strictEqual(queries, 1);
  assert.strictEqual(rebuilds, 1);
});

// ---- popup.js（AC-26〜AC-28） ----

function loadPopup(stored, items) {
  const deleteButton = { handlers: {} };
  deleteButton.addEventListener = (type, fn) => {
    deleteButton.handlers[type] = fn;
  };
  const noop = { addEventListener() {} };
  const env = createEnv({
    stored,
    items,
    createElement: () => ({
      innerHTML: "",
      addEventListener() {},
      querySelector: (selector) =>
        selector === ".delete-button" ? deleteButton : noop,
    }),
  });
  env.load("shared.js");
  env.load("i18n.js");
  env.load("popup.js");
  const displayCalls = [];
  env.sandbox.displayJumpmarks = async () => displayCalls.push(1);
  return { ...env, displayCalls, deleteButton };
}

test("popup delete button click calls deleteJumpmarkAndRefresh", () => {
  const { sandbox, deleteButton } = loadPopup({});
  const calls = [];
  sandbox.deleteJumpmarkAndRefresh = (id) => calls.push(id);
  sandbox.createJumpmarkElement({ id: "u1", title: "t", url: "https://b.com" });
  let stopped = 0;
  deleteButton.handlers.click({ stopPropagation: () => stopped++ });
  assert.deepStrictEqual(calls, ["u1"]);
  assert.strictEqual(stopped, 1);
});

test("popup deleteJumpmarkAndRefresh: existing id", async () => {
  const { sandbox, state, displayCalls } = loadPopup({
    "a.com": [{ id: "d1", title: "t" }],
    "b.com": [{ id: "k1", title: "k" }],
  });
  await sandbox.deleteJumpmarkAndRefresh("d1");
  assert.strictEqual(state.setCalls.length, 1);
  assert.deepStrictEqual(plain(await sandbox.readJumpmarksStore()), {
    "b.com": [{ id: "k1", title: "k" }],
  });
  assert.strictEqual(displayCalls.length, 1);
  assert.deepStrictEqual(state.alerts, []);
});

test("popup deleteJumpmarkAndRefresh: missing id", async () => {
  const { sandbox, state, displayCalls } = loadPopup({
    "a.com": [{ id: "d1", title: "t" }],
  });
  await sandbox.deleteJumpmarkAndRefresh("nope");
  assert.strictEqual(state.setCalls.length, 0);
  assert.strictEqual(displayCalls.length, 0);
  assert.deepStrictEqual(state.alerts, []);
});

test("popup deleteJumpmarkAndRefresh: get rejects", async () => {
  const { sandbox, state } = loadPopup({});
  state.getError = new Error("boom");
  await sandbox.deleteJumpmarkAndRefresh("d1");
  assert.deepStrictEqual(state.alerts, ["popupErrorDeleteFailed"]);
});

test("popup deleteJumpmarkAndRefresh: over-quota stored data", async () => {
  const { sandbox, state } = loadPopup(undefined, overQuotaItems());
  await sandbox.deleteJumpmarkAndRefresh("d1");
  assert.strictEqual(state.setCalls.length, 1);
  assert.deepStrictEqual(state.alerts, []);
});

test("updateStorageWarning reads usage via readStorageUsageBytes", async () => {
  const { sandbox, state } = loadPopup({ "a.com": [{ id: "1" }] });
  const seen = [];
  sandbox.calculateStorageUsagePercent = (bytes) => {
    seen.push(bytes);
    return 0;
  };
  await sandbox.updateStorageWarning();
  assert.deepStrictEqual(plain(state.getCalls), [null]);
  assert.deepStrictEqual(seen, [await sandbox.readStorageUsageBytes()]);
});

// ---- ドキュメント・バージョン（AC-31, AC-32） ----

test("CHANGELOG [Unreleased] mentions the storage entry points", () => {
  const changelog = readSource("CHANGELOG.md");
  const start = changelog.indexOf("## [Unreleased]");
  const end = changelog.indexOf("## [2.3.0]");
  assert.ok(start !== -1 && end > start);
  const section = changelog.slice(start, end);
  for (const name of [
    "readJumpmarksStore",
    "writeJumpmarksStore",
    "onJumpmarksChanged",
  ]) {
    assert.ok(section.includes(name), name);
  }
});

test("manifest.json version is unchanged", () => {
  assert.strictEqual(JSON.parse(readSource("manifest.json")).version, "2.4.2");
});
