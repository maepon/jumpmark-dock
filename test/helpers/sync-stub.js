// テスト共通のスタブ。chrome.storage.sync（項目の集合を持つ get / set / remove）と、
// 手動で進められる setTimeout / clearTimeout を作る
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");

// vm の別コンテキストで作られた値は prototype が違うので、JSON 経由で複製・比較する
const plain = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

// chrome.storage は読み返すときにオブジェクトのキーを昇順に並べ替える（Chrome で確認済み）。
// get はこれに合わせ、キーを深い階層まで並べ替えた複製を返す
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value === null || typeof value !== "object") return value;
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortKeysDeep(value[key]);
  }
  return sorted;
}

const chromeStorageCopy = (value) => sortKeysDeep(plain(value));

function readSource(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

// get(null) が全項目のコピー（キーは昇順）を返し、set / remove が集合を書き換えるスタブ。
// 旧形式の "jumpmarks" 項目は新バージョンが書いてはいけないので、set / remove で受けたら例外にする
function createSyncStub(initialItems = {}) {
  const state = {
    items: plain(initialItems),
    getCalls: [],
    setCalls: [],
    removeCalls: [],
    getError: null,
    setError: null,
    removeError: null,
  };
  const sync = {
    get: async (keys) => {
      state.getCalls.push(keys);
      if (state.getError) throw state.getError;
      return chromeStorageCopy(state.items);
    },
    set: async (value) => {
      if ("jumpmarks" in value) {
        throw new Error("test stub: the legacy jumpmarks key must not be set");
      }
      state.setCalls.push(plain(value));
      if (state.setError) throw state.setError;
      Object.assign(state.items, plain(value));
    },
    remove: async (keys) => {
      const list = [].concat(keys);
      if (list.includes("jumpmarks")) {
        throw new Error(
          "test stub: the legacy jumpmarks key must not be removed",
        );
      }
      state.removeCalls.push(plain(list));
      if (state.removeError) throw state.removeError;
      for (const key of list) delete state.items[key];
    },
  };
  return { sync, state };
}

// 時間を手動で進められる setTimeout / clearTimeout（vm の sandbox には node:test の mock.timers が効かない）
function createFakeTimers() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    setTimeout: (fn, delay = 0) => {
      const id = nextId++;
      timers.set(id, { fn, at: now + delay });
      return id;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
    advance: (ms) => {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].fn();
      }
      now = target;
    },
    pending: () => timers.size,
  };
}

// 旧形式の jumpmarks（{ 作成元URL: [Jumpmark, ...] }）を、新しい保存形式の項目群にする
let builderSandbox = null;
function buildItems(jumpmarks) {
  if (!builderSandbox) {
    builderSandbox = { TextEncoder, URL, console };
    vm.createContext(builderSandbox);
    vm.runInContext(readSource("shared.js"), builderSandbox);
  }
  return plain(builderSandbox.buildJumpmarksStorageItems(jumpmarks));
}

module.exports = {
  ROOT,
  plain,
  readSource,
  createSyncStub,
  createFakeTimers,
  buildItems,
};
