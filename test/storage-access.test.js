// chrome.storage の入口（shared.js の readJumpmarksStore / writeJumpmarksStore / onJumpmarksChanged）と、
// それを使う background.js / popup.js を、chrome のスタブ越しに確かめる
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const QUOTA = 8192;

function readSource(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

// vm の別コンテキストで作られた値は prototype が違うので、JSON 経由で比べる
const plain = (value) => JSON.parse(JSON.stringify(value));

// calculateJumpmarksBytes がちょうど bytes になるデータ
const dataWithBytes = (bytes) => ({
  "a.com": [{ title: "x".repeat(bytes - 33) }],
});

// 容量超過の保存済みデータ（"d1" は小さな削除対象）
const overQuotaStored = () => ({
  "b.com": [{ id: "big", title: "x".repeat(QUOTA) }],
  "a.com": [{ id: "d1", title: "t" }],
});

const tick = () => new Promise((resolve) => setImmediate(resolve));

// shared.js は 1 sandbox に 1 回だけ読む（const の再宣言を避ける）
function createEnv(options = {}) {
  const state = {
    stored: options.stored ?? {},
    getCalls: [],
    setCalls: [],
    listeners: [],
    log: { error: [], warn: [], log: [] },
    alerts: [],
    getError: null,
    setError: null,
  };
  const sandbox = {
    console: {
      ...console,
      error: (...a) => state.log.error.push(a),
      warn: (...a) => state.log.warn.push(a),
      log: (...a) => state.log.log.push(a),
    },
    URL,
    TextEncoder,
    setTimeout: () => 0,
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
        sync: {
          get: async (keys) => {
            state.getCalls.push(keys);
            if (state.getError) throw state.getError;
            return { jumpmarks: JSON.parse(JSON.stringify(state.stored)) };
          },
          set: async (value) => {
            state.setCalls.push(value);
            if (state.setError) throw state.setError;
          },
        },
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
  assert.deepStrictEqual(plain(state.getCalls), [["jumpmarks"]]);
});

test("readJumpmarksStore returns {} when empty", async () => {
  const { sandbox, state } = loadShared();
  state.stored = undefined;
  sandbox.chrome.storage.sync.get = async () => ({});
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
  for (const bytes of [100, QUOTA]) {
    const { sandbox, state } = loadShared();
    const data = dataWithBytes(bytes);
    assert.strictEqual(sandbox.calculateJumpmarksBytes(data), bytes);
    await sandbox.writeJumpmarksStore(data);
    assert.deepStrictEqual(plain(state.setCalls), [{ jumpmarks: data }]);
  }
});

test("writeJumpmarksStore rejects over quota without set or log", async () => {
  const { sandbox, state } = loadShared();
  await assert.rejects(
    sandbox.writeJumpmarksStore(dataWithBytes(QUOTA + 1)),
    (e) => sandbox.isStorageQuotaError(e) === true,
  );
  assert.strictEqual(state.setCalls.length, 0);
  noLogs(state);
});

test("writeJumpmarksStore with checkQuota false skips quota", async () => {
  const { sandbox, state } = loadShared();
  await sandbox.writeJumpmarksStore(dataWithBytes(QUOTA + 1), {
    checkQuota: false,
  });
  assert.strictEqual(state.setCalls.length, 1);
});

test("writeJumpmarksStore rejects with same error when set fails", async () => {
  const { sandbox, state } = loadShared();
  const err = new Error("set failed");
  state.setError = err;
  await assert.rejects(
    sandbox.writeJumpmarksStore(dataWithBytes(100)),
    (e) => e === err,
  );
  noLogs(state);
});

test("onJumpmarksChanged registers synchronously", () => {
  const { sandbox, state } = loadShared();
  sandbox.onJumpmarksChanged(() => {});
  assert.strictEqual(state.listeners.length, 1);
});

test("onJumpmarksChanged listener filters area and key", () => {
  const { sandbox, state } = loadShared();
  const calls = [];
  sandbox.onJumpmarksChanged((...args) => {
    calls.push(args);
    return "result";
  });
  const [listener] = state.listeners;
  const changed = { jumpmarks: { newValue: {} } };
  assert.strictEqual(listener(changed, "local"), undefined);
  assert.strictEqual(listener({ other: { newValue: 1 } }, "sync"), undefined);
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(listener(changed, "sync"), "result");
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
    const { sandbox, state } = loadShared({ stored: overQuotaStored() });
    await sandbox[name](...args);
    assert.strictEqual(state.setCalls.length, 1, name);
    assert.ok(!("a.com" in state.setCalls[0].jumpmarks), name);
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
  assert.deepStrictEqual(plain(state.getCalls), [["jumpmarks"]]);
  state.getCalls.length = 0;
  assert.strictEqual(
    await sandbox.getJumpmarkCountForUrl("https://a.com/x"),
    1,
  );
  assert.ok(state.getCalls.length >= 1);
  for (const keys of state.getCalls)
    assert.deepStrictEqual(plain(keys), ["jumpmarks"]);
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

  state.stored = { "a.com*": [{ id: "1" }, { id: "2" }] };
  await state.listeners[0]({ jumpmarks: { newValue: state.stored } }, "sync");
  await tick();
  assert.deepStrictEqual(plain(badges[badges.length - 1]), {
    tabId: 1,
    text: "2",
  });
});

// ---- popup.js（AC-26〜AC-28） ----

function loadPopup(stored) {
  const deleteButton = { handlers: {} };
  deleteButton.addEventListener = (type, fn) => {
    deleteButton.handlers[type] = fn;
  };
  const noop = { addEventListener() {} };
  const env = createEnv({
    stored,
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
  assert.deepStrictEqual(Object.keys(state.setCalls[0].jumpmarks), ["b.com"]);
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
  const { sandbox, state } = loadPopup(overQuotaStored());
  await sandbox.deleteJumpmarkAndRefresh("d1");
  assert.strictEqual(state.setCalls.length, 1);
  assert.deepStrictEqual(state.alerts, []);
});

test("updateStorageWarning reads via readJumpmarksStore", async () => {
  const stored = { "a.com": [{ id: "1" }] };
  const { sandbox } = loadPopup(stored);
  const seen = [];
  sandbox.calculateJumpmarksBytes = (value) => {
    seen.push(value);
    return 0;
  };
  await sandbox.updateStorageWarning();
  assert.deepStrictEqual(seen, [stored]);
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
  assert.strictEqual(JSON.parse(readSource("manifest.json")).version, "2.3.0");
});
