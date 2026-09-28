const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");

function readSource(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

test("popup.js and options.js render icon/url via escapeHtml()", () => {
  const popupSource = readSource("popup.js");
  const optionsSource = readSource("options.js");

  assert.ok(
    popupSource.includes(
      '<div class="jumpmark-icon">${escapeHtml(jumpmark.icon || "🔗")}</div>',
    ),
    "popup.js should render the jumpmark icon via escapeHtml()",
  );
  assert.ok(
    optionsSource.includes(
      '<span class="jumpmark-icon">${escapeHtml(jumpmark.icon || "🔗")}</span>',
    ),
    "options.js createJumpmarkRow() should render the icon via escapeHtml()",
  );
  assert.ok(
    optionsSource.includes(
      '<span class="jumpmark-icon">${escapeHtml(jm.icon || "🔗")}</span>',
    ),
    "options.js exportToHtml() should render the icon via escapeHtml()",
  );
  assert.ok(
    optionsSource.includes(
      '<a href="${escapeHtml(jm.url)}" class="jumpmark-url" target="_blank">${escapeHtml(jm.url)}</a>',
    ),
    "options.js exportToHtml() should render the href attribute via escapeHtml()",
  );
});

test("popup.js and options.js do not contain unescaped icon/url template fragments", () => {
  const popupSource = readSource("popup.js");
  const optionsSource = readSource("options.js");
  const forbiddenFragments = [
    "${jumpmark.icon",
    "${jm.icon",
    'href="${jm.url}',
    'href="${jumpmark.url}',
  ];

  for (const fragment of forbiddenFragments) {
    assert.strictEqual(
      popupSource.includes(fragment),
      false,
      `popup.js should not contain unescaped fragment: ${fragment}`,
    );
    assert.strictEqual(
      optionsSource.includes(fragment),
      false,
      `options.js should not contain unescaped fragment: ${fragment}`,
    );
  }
});

// escapeHtml() is defined three times (shared.js, popup.js, options.js). Only the
// options.js version escapes " and ' — shared.js/popup.js build it via
// `div.textContent = text; return div.innerHTML`, which is DOM text-node
// serialization and does not escape quotes (they're only special inside an
// attribute value, not text content). options.html loads shared.js -> i18n.js ->
// options.js, so the last-defined (options.js) escapeHtml() is the one every
// caller in that page actually gets, including exportToHtml() in options.js itself.
// The two static-source tests above can't see this: they only check that a call to
// *a* function named escapeHtml() is present in the source text, not which
// definition wins at runtime. This test loads the three scripts in the real
// options.html order and exercises exportToHtml() itself, so a future re-ordering
// of the <script> tags, or a "de-duplicate escapeHtml()" refactor that points
// options.js at the non-quote-escaping version, fails this test instead of staying
// green.
test("options.html script order keeps the quote-escaping escapeHtml() active in exportToHtml()", () => {
  function createElement() {
    let text = "";
    return {
      set textContent(value) {
        text = String(value);
      },
      get innerHTML() {
        // Mirrors real DOM serialization of a text-only node: & < > are escaped,
        // " and ' are not (matches Chrome's actual innerHTML behavior).
        return text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      },
    };
  }

  const sandbox = {
    console,
    document: {
      createElement,
      getElementById: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      documentElement: {},
    },
  };
  vm.createContext(sandbox);
  for (const file of ["shared.js", "i18n.js", "options.js"]) {
    vm.runInContext(readSource(file), sandbox);
  }

  const result = sandbox.exportToHtml([
    {
      id: "1",
      title: "Evil",
      url: 'https://example.com/"><script>alert(1)</script>',
      icon: "🔗",
      // Ends with "*" so exportToHtml() takes the wildcard branch and never calls
      // findBidirectionalPartner() (which needs chrome.storage, not stubbed here).
      sourceUrl: "example.com/*",
      created: new Date().toISOString(),
    },
  ]);

  assert.ok(
    result.content.includes("&quot;"),
    'exportToHtml() href should escape " via the options.js escapeHtml(), not silently fall back to a version that does not escape quotes',
  );
  assert.strictEqual(
    result.content.includes('"><script>alert(1)</script>'),
    false,
    'exportToHtml() must not let a " in a jumpmark URL break out of the href attribute',
  );
});
