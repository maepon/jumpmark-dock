const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

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
