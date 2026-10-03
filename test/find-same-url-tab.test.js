const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const sharedSrc = fs.readFileSync(path.join(root, "shared.js"), "utf8");
const popupSrc = fs.readFileSync(path.join(root, "popup.js"), "utf8");

// shared.js is a plain browser script, so load it into a sandbox.
function loadShared(extra = {}) {
  const sandbox = { console, URL, ...extra };
  vm.createContext(sandbox);
  vm.runInContext(sharedSrc, sandbox);
  return sandbox;
}

const { findSameUrlTab } = loadShared();

function matchId(url, tabUrl) {
  const tab = findSameUrlTab([{ id: 1, url: tabUrl }], url);
  return tab ? tab.id : null;
}

test("findSameUrlTab ignores trailing slash, hash and case", () => {
  assert.strictEqual(matchId("https://maepon.blog", "https://maepon.blog/"), 1);
  assert.strictEqual(
    matchId(
      "https://maepon.blog/2026-06-22",
      "https://maepon.blog/2026-06-22/",
    ),
    1,
  );
  assert.strictEqual(
    matchId("https://example.com/a", "https://example.com/a#section"),
    1,
  );
  assert.strictEqual(
    matchId("HTTPS://Example.com/a", "https://example.com/a"),
    1,
  );
});

test("findSameUrlTab ignores default ports", () => {
  assert.strictEqual(
    matchId("https://example.com:443/a", "https://example.com/a"),
    1,
  );
  assert.strictEqual(
    matchId("http://example.com:80/a", "http://example.com/a"),
    1,
  );
});

test("findSameUrlTab distinguishes query, scheme, www and path", () => {
  assert.strictEqual(
    matchId("https://example.com/a?q=1", "https://example.com/a?q=2"),
    null,
  );
  assert.strictEqual(
    matchId("http://example.com/a", "https://example.com/a"),
    null,
  );
  assert.strictEqual(
    matchId("https://www.example.com/a", "https://example.com/a"),
    null,
  );
  assert.strictEqual(
    matchId("https://example.com/a", "https://example.com/b"),
    null,
  );
});

test("findSameUrlTab matches same query with different hash and slash", () => {
  assert.strictEqual(
    matchId("https://example.com/a/?q=1", "https://example.com/a?q=1#top"),
    1,
  );
});

test("findSameUrlTab never throws and returns null for unusable input", () => {
  const ok = [{ id: 1, url: "https://maepon.blog/" }];
  assert.doesNotThrow(() => findSameUrlTab([{ id: 1 }], "https://a.com"));
  assert.strictEqual(findSameUrlTab([{ id: 1 }], "https://a.com"), null);
  assert.strictEqual(
    findSameUrlTab([{ id: 1, url: "not a url" }], "https://a.com"),
    null,
  );
  assert.strictEqual(
    findSameUrlTab(
      [{ id: 1, url: "chrome://extensions/" }],
      "chrome://extensions/",
    ),
    null,
  );
  assert.strictEqual(findSameUrlTab(ok, "maepon.blog"), null);
  assert.strictEqual(findSameUrlTab(ok, undefined), null);
  assert.strictEqual(findSameUrlTab(undefined, "https://a.com"), null);
  assert.strictEqual(findSameUrlTab(null, "https://a.com"), null);
  assert.strictEqual(
    findSameUrlTab([null, { id: 2, url: "https://b.com" }], "https://a.com"),
    null,
  );
});

test("findSameUrlTab returns the first match", () => {
  const tabs = [
    { id: 1, url: "https://example.com/b" },
    { id: 2, url: "https://example.com/a/" },
    { id: 3, url: "https://example.com/a#x" },
  ];
  const snapshot = JSON.stringify(tabs);
  assert.strictEqual(findSameUrlTab(tabs, "https://example.com/a").id, 2);
  assert.strictEqual(JSON.stringify(tabs), snapshot);

  const withJunk = [
    null,
    undefined,
    { id: 4 },
    { id: 5, url: "https://example.com/a/" },
  ];
  assert.strictEqual(findSameUrlTab(withJunk, "https://example.com/a").id, 5);
});

// navigateToUrl with stubbed chrome APIs
function createNavSandbox({
  tabs = [],
  queryError = null,
  createError = null,
}) {
  const calls = { update: [], windowsUpdate: [], create: [], close: 0 };
  const chrome = {
    tabs: {
      query: async () => {
        if (queryError) throw queryError;
        return tabs;
      },
      update: async (...args) => {
        calls.update.push(args);
      },
      create: async (...args) => {
        calls.create.push(args);
        if (createError) throw createError;
      },
    },
    windows: {
      update: async (...args) => {
        calls.windowsUpdate.push(args);
      },
    },
  };
  const window = {
    close: () => {
      calls.close += 1;
    },
  };
  const silentConsole = { error: () => {}, log: () => {}, warn: () => {} };
  const sandbox = loadShared({ chrome, window, console: silentConsole });
  return { sandbox, calls };
}

test("navigateToUrl focuses the existing tab", async () => {
  const { sandbox, calls } = createNavSandbox({
    tabs: [{ id: 7, windowId: 3, url: "https://maepon.blog/" }],
  });
  await sandbox.navigateToUrl("https://maepon.blog");
  // The args come from the vm realm, so compare them as JSON.
  assert.strictEqual(JSON.stringify(calls.update), '[[7,{"active":true}]]');
  assert.strictEqual(
    JSON.stringify(calls.windowsUpdate),
    '[[3,{"focused":true}]]',
  );
  assert.strictEqual(calls.create.length, 0);
  assert.strictEqual(calls.close, 1);
});

test("navigateToUrl opens a new tab when none matches", async () => {
  const { sandbox, calls } = createNavSandbox({
    tabs: [{ id: 7, windowId: 3, url: "https://other.example/" }],
  });
  await sandbox.navigateToUrl("https://maepon.blog");
  assert.strictEqual(
    JSON.stringify(calls.create),
    '[[{"url":"https://maepon.blog"}]]',
  );
  assert.strictEqual(calls.update.length, 0);
});

test("navigateToUrl falls back to a new tab when query rejects", async () => {
  const { sandbox, calls } = createNavSandbox({
    queryError: new Error("query failed"),
  });
  await assert.doesNotReject(sandbox.navigateToUrl("https://maepon.blog"));
  assert.strictEqual(
    JSON.stringify(calls.create),
    '[[{"url":"https://maepon.blog"}]]',
  );

  const failing = createNavSandbox({
    queryError: new Error("query failed"),
    createError: new Error("create failed"),
  });
  await assert.doesNotReject(failing.sandbox.navigateToUrl("https://a.com"));
});

test("navigateToUrl is defined only in shared.js", () => {
  assert.doesNotMatch(popupSrc, /function navigateToUrl/);
  assert.match(sharedSrc, /function navigateToUrl/);
});

test("old exact-match comparison is gone", () => {
  const old = new RegExp("tab\\.url ===" + " url");
  assert.doesNotMatch(sharedSrc, old);
  assert.doesNotMatch(popupSrc, old);
});

test("findSameUrlTab is defined and used by navigateToUrl", () => {
  assert.match(sharedSrc, /function findSameUrlTab\(/);
  const body = sharedSrc.slice(
    sharedSrc.indexOf("async function navigateToUrl"),
  );
  assert.match(body, /findSameUrlTab\(tabs, url\)/);
});

test("CHANGELOG has Fixed entry under Unreleased", () => {
  const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  const start = changelog.indexOf("## [Unreleased]");
  const end = changelog.indexOf("## [2.4.0]");
  assert.ok(start >= 0 && end > start);
  assert.match(changelog.slice(start, end), /### Fixed/);
});

test("README mentions same-page tab matching", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const lines = readme.split("\n");
  const line = lines.find((l) =>
    l.startsWith("- 同じURLのタブがあればフォーカス"),
  );
  assert.ok(line);
  assert.match(line, /末尾の `\/`/);
  assert.match(line, /`#`/);
});
