// popup の送信処理が、戻りの Jumpmark のタイトルを作成元ページ（今のタブ）のタイトルにすることを確かめる
const test = require("node:test");
const assert = require("node:assert");
const vm = require("node:vm");
const {
  readSource,
  createSyncStub,
  buildItems,
} = require("./helpers/sync-stub");

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

const UP = {
  id: "u1",
  title: "Target Page",
  url: "https://t.com/x",
  icon: "🔖",
  sourceUrl: "a.com/page",
  created: "2026-01-01T00:00:00.000Z",
};
const RETURN = {
  id: "r1",
  title: "← Old Return",
  url: "https://a.com/page",
  icon: "🔖",
  sourceUrl: "t.com/x",
  created: "2026-01-01T00:00:00.000Z",
};

const plain = (value) => JSON.parse(JSON.stringify(value));

// shared.js -> i18n.js -> popup.js を読み込み、popup の submit ハンドラを呼べる状態にする。
// saveJumpmark / updateJumpmark は本物を呼ぶラッパーで差し替え、引数を記録する
function setup({
  stored = {},
  tab = { url: "https://a.com/page", title: "Source Page" },
  sourceUrl = "https://a.com/page",
  title = "Target Page",
  bidirectional = true,
  editing = null,
  hasPartner = false,
} = {}) {
  const elements = new Map();
  const stub = createSyncStub(buildItems(stored));
  const sandbox = {
    console: { ...console, error: () => {} },
    URL,
    TextEncoder,
    setTimeout: () => 0,
    alert: () => {},
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
      i18n: { getMessage: (key) => key },
      storage: { sync: stub.sync },
    },
  };
  vm.createContext(sandbox);
  for (const file of ["shared.js", "i18n.js", "popup.js"]) {
    vm.runInContext(readSource(file), sandbox);
  }
  let n = 0;
  sandbox.generateUniqueId = () => "id" + ++n;
  const calls = { save: [], update: [] };
  const realSave = sandbox.saveJumpmark;
  const realUpdate = sandbox.updateJumpmark;
  sandbox.saveJumpmark = (...args) => {
    calls.save.push(args[0]);
    return realSave(...args);
  };
  sandbox.updateJumpmark = (...args) => {
    calls.update.push(args[1]);
    return realUpdate(...args);
  };
  sandbox.showMainView = () => {};
  sandbox.displayJumpmarks = async () => {};

  const el = sandbox.document.getElementById;
  el("sourceUrlPattern").value = sourceUrl;
  el("jumpmarkTitle").value = title;
  el("jumpmarkUrl").value = "https://t.com/x";
  el("jumpmarkIcon").value = "🔖";
  el("bidirectional").checked = bidirectional;
  sandbox.__tab = tab;
  sandbox.__editing = editing;
  sandbox.__hasPartner = hasPartner;
  vm.runInContext(
    "currentTab = __tab; editingJumpmark = __editing; editingHasInitialPartner = __hasPartner;",
    sandbox,
  );
  sandbox.setupEventListeners();
  const handler = el("jumpmarkForm").handlers.submit;
  return {
    sandbox,
    calls,
    submit: () => handler({ preventDefault() {} }),
    read: async () => plain(await sandbox.readJumpmarksStore()),
  };
}

test("#34 AC-1: new bidirectional uses the tab title for the return title", async () => {
  const { calls, submit, read } = setup();
  await submit();
  const store = await read();
  assert.strictEqual(store["a.com/page"].length, 1);
  assert.strictEqual(store["a.com/page"][0].title, "Target Page");
  assert.strictEqual(store["a.com/page"][0].url, "https://t.com/x");
  assert.strictEqual(store["t.com/x"].length, 1);
  assert.strictEqual(store["t.com/x"][0].title, "← Source Page");
  assert.strictEqual(store["t.com/x"][0].url, "https://a.com/page");
  assert.ok(!("reverseTitle" in store["a.com/page"][0]));
  assert.ok(!("reverseTitle" in store["t.com/x"][0]));
  assert.strictEqual(calls.save[0].reverseTitle, "← Source Page");
});

test("#34 AC-2: normalized-equal URLs still use the tab title", async () => {
  const { submit, read } = setup({
    tab: { url: "https://www.a.com/page/", title: "Source Page" },
  });
  await submit();
  const store = await read();
  assert.strictEqual(store["t.com/x"][0].title, "← Source Page");
});

test("#34 AC-3: empty tab title falls back to the source URL", async () => {
  const tabs = [
    { url: "https://a.com/page", title: "" },
    { url: "https://a.com/page", title: "   " },
    { url: "https://a.com/page" },
  ];
  for (const tab of tabs) {
    const { submit, read } = setup({ tab });
    await submit();
    const store = await read();
    assert.strictEqual(store["t.com/x"][0].title, "← a.com/page");
  }
});

test("#34 AC-4: tab title is trimmed", async () => {
  const { submit, read } = setup({
    tab: { url: "https://a.com/page", title: "  Source Page  " },
  });
  await submit();
  const store = await read();
  assert.strictEqual(store["t.com/x"][0].title, "← Source Page");
});

test("#34 AC-5: source URL different from the tab does not pass reverseTitle", async () => {
  const { calls, submit, read } = setup({ sourceUrl: "https://a.com/other" });
  await submit();
  const store = await read();
  assert.strictEqual(store["t.com/x"][0].title, "← Target Page");
  assert.strictEqual(store["t.com/x"][0].url, "https://a.com/other");
  assert.strictEqual("reverseTitle" in calls.save[0], false);
});

test("#34 AC-6: bidirectional off does not pass reverseTitle", async () => {
  const { calls, submit, read } = setup({ bidirectional: false });
  await submit();
  const store = await read();
  assert.strictEqual("reverseTitle" in calls.save[0], false);
  assert.ok(!("t.com/x" in store));
});

test("#34 AC-7: editing with an existing return keeps its title", async () => {
  const { calls, submit, read } = setup({
    stored: { "a.com/page": [UP], "t.com/x": [RETURN] },
    editing: UP,
    hasPartner: true,
    title: "New Title",
  });
  await submit();
  const store = await read();
  assert.strictEqual("reverseTitle" in calls.update[0], false);
  assert.strictEqual(store["t.com/x"].length, 1);
  assert.strictEqual(store["t.com/x"][0].id, "r1");
  assert.strictEqual(store["t.com/x"][0].title, "← Old Return");
  assert.strictEqual(store["a.com/page"][0].title, "New Title");
});

test("#34 AC-8a: editing and creating a new return uses the tab title", async () => {
  const { submit, read } = setup({
    stored: { "a.com/page": [UP] },
    editing: UP,
  });
  await submit();
  const store = await read();
  assert.strictEqual(store["t.com/x"][0].title, "← Source Page");
});

test("#34 AC-8b: editing and creating a new return falls back to the source URL", async () => {
  const { submit, read } = setup({
    stored: { "a.com/page": [UP] },
    editing: UP,
    tab: { url: "https://a.com/page", title: "" },
  });
  await submit();
  const store = await read();
  assert.strictEqual(store["t.com/x"][0].title, "← a.com/page");
});

test("#34 AC-8c: editing with a source URL different from the tab does not pass reverseTitle", async () => {
  const { calls, submit, read } = setup({
    stored: { "a.com/page": [UP] },
    editing: UP,
    sourceUrl: "https://a.com/other",
  });
  await submit();
  const store = await read();
  assert.strictEqual(store["t.com/x"][0].title, "← Target Page");
  assert.strictEqual("reverseTitle" in calls.update[0], false);
});

test("#34 AC-9: reverseTitle is not persisted on the edited jumpmark (popup)", async () => {
  const { submit, read } = setup({
    stored: { "a.com/page": [UP] },
    editing: UP,
  });
  await submit();
  const store = await read();
  assert.strictEqual(store["a.com/page"].length, 1);
  assert.ok(!("reverseTitle" in store["a.com/page"][0]));
});

test("#34 AC-9: reverseTitle is not persisted on the edited jumpmark (updateJumpmark)", async () => {
  const { sandbox, read } = setup({ stored: { "a.com/page": [UP] } });
  await sandbox.updateJumpmark("u1", {
    title: "x",
    url: "https://t.com/x",
    sourceUrl: "https://a.com/page",
    createBidirectional: true,
    reverseTitle: "← R",
  });
  const store = await read();
  assert.strictEqual(store["a.com/page"].length, 1);
  assert.ok(!("reverseTitle" in store["a.com/page"][0]));
  assert.strictEqual(store["t.com/x"][0].title, "← R");
});
