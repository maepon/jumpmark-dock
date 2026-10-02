const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createSyncStub, buildItems } = require("./helpers/sync-stub");

// shared.js is a plain browser script (no module.exports), so we load it into
// a sandbox and pull out the function we want to test.
const sharedSrc = fs.readFileSync(
  path.join(__dirname, "..", "shared.js"),
  "utf8",
);
const sandbox = { console, URL };
vm.createContext(sandbox);
vm.runInContext(sharedSrc, sandbox);
const { parseUrlPattern, filterSelectableTabs } = sandbox;

test("parseUrlPattern parses a plain https URL", () => {
  const result = parseUrlPattern("https://example.com/path/");
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.hostname, "example.com");
  assert.strictEqual(result.host, "example.com");
  assert.strictEqual(result.pathname, "/path");
  assert.strictEqual(result.isWildcard, false);
  assert.strictEqual(result.normalizedWithoutWildcard, "example.com/path");
});

test("parseUrlPattern strips www. and detects wildcard", () => {
  const result = parseUrlPattern("https://www.example.com/path/*");
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.host, "example.com");
  assert.strictEqual(result.isWildcard, true);
});

test("parseUrlPattern returns empty result for falsy input", () => {
  const result = parseUrlPattern("");
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.hostname, "");
});

// vm 内で作られた配列は別 realm なので、素の値に変換してから比較する
const makeTab = (overrides) => ({
  id: 100,
  windowId: 1,
  index: 0,
  url: "https://example.com/",
  title: "t",
  incognito: false,
  ...overrides,
});
const idsOf = (tabs) => Array.from(tabs).map((tab) => tab.id);

test("filterSelectableTabs excludes the current tab by id", () => {
  const currentTab = makeTab({ id: 1 });
  const result = filterSelectableTabs(
    [makeTab({ id: 1 }), makeTab({ id: 2 })],
    currentTab,
  );
  assert.deepStrictEqual(idsOf(result), [2]);
});

test("filterSelectableTabs excludes non-http(s) and invalid URLs", () => {
  const urls = [
    "chrome://extensions/",
    "chrome-extension://abc/popup.html",
    "about:blank",
    "file:///tmp/a.html",
    "view-source:https://example.com/",
    "not a url",
    undefined,
  ];
  const tabs = urls.map((url, i) => makeTab({ id: 10 + i, url }));
  const result = filterSelectableTabs(tabs, makeTab({ id: 1 }));
  assert.strictEqual(result.length, 0);
});

test("filterSelectableTabs keeps http and https tabs", () => {
  const result = filterSelectableTabs(
    [
      makeTab({ id: 2, url: "http://example.com/" }),
      makeTab({ id: 3, url: "https://example.org/" }),
    ],
    makeTab({ id: 1 }),
  );
  assert.deepStrictEqual(idsOf(result), [2, 3]);
});

test("filterSelectableTabs matches incognito state with the current tab", () => {
  const normal = makeTab({ id: 1, incognito: false });
  const incognito = makeTab({ id: 1, incognito: true });
  const normalTab = makeTab({ id: 2, incognito: false });
  const incognitoTab = makeTab({ id: 3, incognito: true });

  assert.deepStrictEqual(
    idsOf(filterSelectableTabs([normalTab, incognitoTab], normal)),
    [2],
  );
  assert.deepStrictEqual(
    idsOf(filterSelectableTabs([normalTab, incognitoTab], incognito)),
    [3],
  );
});

test("filterSelectableTabs with null currentTab", () => {
  const tabs = [
    makeTab({ id: 2 }),
    makeTab({ id: 3, incognito: true }),
    makeTab({ id: 4, url: "http://example.com/" }),
  ];
  assert.deepStrictEqual(idsOf(filterSelectableTabs(tabs, null)), [2, 4]);
  assert.deepStrictEqual(idsOf(filterSelectableTabs(tabs, undefined)), [2, 4]);
});

test("filterSelectableTabs orders current window first then by windowId and index", () => {
  const tabs = [
    makeTab({ id: 11, windowId: 3, index: 0 }),
    makeTab({ id: 12, windowId: 1, index: 1 }),
    makeTab({ id: 13, windowId: 2, index: 1 }),
    makeTab({ id: 14, windowId: 1, index: 0 }),
    makeTab({ id: 15, windowId: 2, index: 0 }),
  ];
  const result = filterSelectableTabs(tabs, makeTab({ id: 1, windowId: 2 }));
  assert.deepStrictEqual(
    Array.from(result).map((tab) => `${tab.windowId},${tab.index}`),
    ["2,0", "2,1", "1,0", "1,1", "3,0"],
  );
});

test("filterSelectableTabs does not mutate its input", () => {
  const tabs = [
    makeTab({ id: 11, windowId: 3, index: 0 }),
    makeTab({ id: 12, windowId: 1, index: 1 }),
    makeTab({ id: 13, windowId: 2, index: 1 }),
    makeTab({ id: 14, windowId: 1, index: 0 }),
  ];
  const snapshot = JSON.parse(JSON.stringify(tabs));
  const result = filterSelectableTabs(tabs, makeTab({ id: 1, windowId: 2 }));
  assert.notStrictEqual(result, tabs);
  assert.strictEqual(tabs.length, snapshot.length);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(tabs)), snapshot);
});

test("filterSelectableTabs does not dedupe identical URLs", () => {
  const result = filterSelectableTabs(
    [
      makeTab({ id: 2, index: 0, url: "https://example.com/same" }),
      makeTab({ id: 3, index: 1, url: "https://example.com/same" }),
    ],
    makeTab({ id: 1 }),
  );
  assert.deepStrictEqual(idsOf(result), [2, 3]);
});

// ---- ストレージ容量（全体 102,400 バイト・1項目 8,192 バイト・最大 512 項目）----

const QUOTA = 8192;

// TextEncoder と chrome.storage.sync のスタブを持つ sandbox を作る
function createQuotaSandbox(stored) {
  const stub = createSyncStub(stored ? buildItems(stored) : {});
  const sb = {
    console: { ...console, error: () => {} },
    URL,
    TextEncoder,
    chrome: { storage: { sync: stub.sync } },
  };
  vm.createContext(sb);
  vm.runInContext(sharedSrc, sb);
  sb.generateUniqueId = () => "fixed-id";
  return { sb, calls: stub.state };
}

const quotaSb = createQuotaSandbox({}).sb;

test("SYNC_QUOTA_BYTES_PER_ITEM is 8192", () => {
  // トップレベルの const は sandbox のプロパティにならないので式として評価する
  assert.strictEqual(
    vm.runInContext("SYNC_QUOTA_BYTES_PER_ITEM", quotaSb),
    QUOTA,
  );
});

test("calculateStorageUsagePercent clamps at 100", () => {
  assert.strictEqual(quotaSb.calculateStorageUsagePercent(0), 0);
  assert.strictEqual(quotaSb.calculateStorageUsagePercent(51200), 50);
  assert.strictEqual(quotaSb.calculateStorageUsagePercent(102400), 100);
  assert.strictEqual(quotaSb.calculateStorageUsagePercent(204800), 100);
});

test("getStorageUsageLevel thresholds", () => {
  const cases = [
    [69.9, "normal"],
    [70, "warning"],
    [89.9, "warning"],
    [90, "danger"],
    [100, "danger"],
  ];
  for (const [percent, level] of cases) {
    assert.strictEqual(quotaSb.getStorageUsageLevel(percent), level, percent);
  }
});

test("formatStorageSize formats KB", () => {
  assert.strictEqual(quotaSb.formatStorageSize(8192), "8.0KB");
  assert.strictEqual(quotaSb.formatStorageSize(1536), "1.5KB");
  assert.strictEqual(quotaSb.formatStorageSize(0), "0.0KB");
});

// キー "jm:7"（4 バイト）の項目がちょうど bytes になる値（{"d":{"a.com":[{"title":"..."}]}} = 30 + 文字数）
const itemWithBytes = (bytes) => ({
  d: { "a.com": [{ title: "x".repeat(bytes - 4 - 30) }] },
});

test("isStorageQuotaExceeded boundary at 8192 per item", () => {
  const atLimit = { "jm:7": itemWithBytes(QUOTA) };
  const overLimit = { "jm:7": itemWithBytes(QUOTA + 1) };
  assert.strictEqual(quotaSb.calculateStorageItemsBytes(atLimit), QUOTA);
  assert.strictEqual(quotaSb.calculateStorageItemsBytes(overLimit), QUOTA + 1);
  assert.strictEqual(quotaSb.isStorageQuotaExceeded(atLimit), false);
  assert.strictEqual(quotaSb.isStorageQuotaExceeded(overLimit), true);
});

test("isStorageQuotaError recognizes quota errors", () => {
  const { isStorageQuotaError, createStorageQuotaError } = quotaSb;
  const quotaError = createStorageQuotaError();
  assert.strictEqual(quotaError.name, "StorageQuotaError");
  assert.strictEqual(quotaError.message, "errorStorageQuotaExceeded");
  assert.strictEqual(isStorageQuotaError(quotaError), true);
  assert.strictEqual(
    isStorageQuotaError(new Error("QUOTA_BYTES_PER_ITEM quota exceeded")),
    true,
  );
  for (const value of [new Error("other"), null, undefined, "QUOTA_BYTES"]) {
    assert.strictEqual(isStorageQuotaError(value), false, String(value));
  }
});

test("assertWithinStorageQuota throws only when over", () => {
  let thrown = null;
  try {
    quotaSb.assertWithinStorageQuota({ "jm:7": itemWithBytes(QUOTA + 1) });
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown);
  assert.strictEqual(quotaSb.isStorageQuotaError(thrown), true);
  assert.doesNotThrow(() =>
    quotaSb.assertWithinStorageQuota({ "jm:7": itemWithBytes(QUOTA) }),
  );
});

const saveInput = { title: "t", url: "https://t.com", sourceUrl: "a.com" };

// 既存データに padding 文字の別 URL（b.com は別のバケット）を置き、saveJumpmark で書かれる項目の大きさを測る
async function measureSaveBytes(padding) {
  const { sb, calls } = createQuotaSandbox({
    "b.com": [{ title: "x".repeat(padding) }],
  });
  await sb.saveJumpmark(saveInput);
  return { calls, bytes: sb.calculateStorageItemsBytes(calls.items) };
}

test("saveJumpmark rejects over quota without calling set", async () => {
  // 既存データだけで全体の上限（102,400 バイト）を超えている
  const filler = {};
  for (let i = 0; i < 15; i++) {
    filler[`site${i}.com`] = [{ title: "x".repeat(7000) }];
  }
  const { sb, calls } = createQuotaSandbox(filler);
  await assert.rejects(sb.saveJumpmark(saveInput), (error) =>
    sb.isStorageQuotaError(error),
  );
  assert.strictEqual(calls.setCalls.length, 0);
});

test("saveJumpmark saves when small", async () => {
  const { calls } = await measureSaveBytes(0);
  assert.strictEqual(calls.setCalls.length, 1);
});

test("saveJumpmark saves when the total is within 102,400 bytes", async () => {
  const base = (await measureSaveBytes(0)).bytes;
  const { calls, bytes } = await measureSaveBytes(2000);
  assert.ok(bytes > base && bytes < 102400);
  assert.strictEqual(calls.setCalls.length, 1);
});

const existingForUpdate = () => ({
  "a.com": [
    {
      id: "u1",
      title: "t",
      url: "https://t.com",
      icon: "🔗",
      sourceUrl: "a.com",
      created: "2024-01-01T00:00:00.000Z",
    },
  ],
});

const updateInput = (padding) => ({
  title: "x".repeat(padding),
  createBidirectional: false,
});

// 更新後の "jm:7"（a.com のバケット）の大きさを測る
async function measureUpdateBytes(padding) {
  const { sb, calls } = createQuotaSandbox(existingForUpdate());
  const result = await sb.updateJumpmark("u1", updateInput(padding));
  return {
    result,
    calls,
    bytes: sb.calculateStorageItemBytes("jm:7", calls.items["jm:7"]),
  };
}

test("updateJumpmark rejects over quota without calling set", async () => {
  const base = (await measureUpdateBytes(0)).bytes;
  const { sb, calls } = createQuotaSandbox(existingForUpdate());
  await assert.rejects(
    sb.updateJumpmark("u1", updateInput(QUOTA - base + 1)),
    (error) => sb.isStorageQuotaError(error),
  );
  assert.strictEqual(calls.setCalls.length, 0);
});

test("updateJumpmark updates when small", async () => {
  const { result, calls } = await measureUpdateBytes(1);
  assert.strictEqual(result, true);
  assert.strictEqual(calls.setCalls.length, 1);
});

test("updateJumpmark updates when the bucket item is exactly 8192 bytes", async () => {
  const base = (await measureUpdateBytes(0)).bytes;
  const { result, calls, bytes } = await measureUpdateBytes(QUOTA - base);
  assert.strictEqual(bytes, QUOTA);
  assert.strictEqual(result, true);
  assert.strictEqual(calls.setCalls.length, 1);
});

test("getStorageStats returns bytes fields", async () => {
  const data = {
    "a.com": [{ id: "1" }, { id: "2" }],
    "b.com": [{ id: "3" }],
  };
  const { sb, calls } = createQuotaSandbox(data);
  const stats = await sb.getStorageStats();
  const bytes = sb.calculateStorageItemsBytes(calls.items);
  assert.ok(bytes > 0);
  assert.strictEqual(stats.bytesUsed, bytes);
  assert.strictEqual(stats.quotaBytes, 102400);
  assert.strictEqual(stats.usagePercent, (bytes / 102400) * 100);
  assert.strictEqual(stats.totalJumpmarks, 3);
  assert.strictEqual(stats.urlCount, 2);
  // 旧フィールドが残っていないことを、キー集合の完全一致で確かめる
  assert.deepStrictEqual(Object.keys(stats).sort(), [
    "bidirectionalJumpmarks",
    "bytesUsed",
    "originalJumpmarks",
    "quotaBytes",
    "totalJumpmarks",
    "urlCount",
    "usagePercent",
  ]);
});

test("getStorageStats falls back on error", async () => {
  const { sb } = createQuotaSandbox({});
  sb.chrome.storage.sync.get = async () => {
    throw new Error("boom");
  };
  const stats = await sb.getStorageStats();
  assert.strictEqual(stats.bytesUsed, 0);
  assert.strictEqual(stats.quotaBytes, 102400);
  assert.strictEqual(stats.usagePercent, 0);
  assert.strictEqual(stats.totalJumpmarks, 0);
});

test("shared.js delete functions do not check quota", () => {
  for (const name of [
    "deleteJumpmark",
    "deleteBidirectionalPair",
    "deleteJumpmarks",
  ]) {
    assert.ok(
      !quotaSb[name].toString().includes("assertWithinStorageQuota"),
      name,
    );
  }
});
