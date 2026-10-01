const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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
