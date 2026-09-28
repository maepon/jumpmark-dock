const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");

function readSource(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

// shared.js -> i18n.js -> options.js を options.html と同じ順で読み込む
function loadOptionsSandbox() {
  function createElement() {
    let text = "";
    return {
      set textContent(value) {
        text = String(value);
      },
      get innerHTML() {
        return text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      },
    };
  }

  const sandbox = {
    console,
    URL,
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
  return sandbox;
}

// "*" 終わりの sourceUrl で wildcard 分岐を通し、findBidirectionalPartner() を呼ばせない
function makeJumpmark(url) {
  return {
    id: "1",
    title: "Title & <b>",
    url,
    icon: "🔗",
    sourceUrl: "example.com/*",
    created: new Date().toISOString(),
  };
}

test("isSafeLinkUrl is defined in options.js", () => {
  const sandbox = loadOptionsSandbox();
  assert.strictEqual(typeof sandbox.isSafeLinkUrl, "function");
});

test("isSafeLinkUrl never throws and rejects non-strings", () => {
  const { isSafeLinkUrl } = loadOptionsSandbox();
  for (const value of [null, undefined, 123, {}, "http://"]) {
    assert.strictEqual(isSafeLinkUrl(value), false, String(value));
  }
});

test("isSafeLinkUrl allows http and https only", () => {
  const { isSafeLinkUrl } = loadOptionsSandbox();
  for (const url of [
    "https://example.com",
    "http://example.com/path?q=1#h",
    "HTTPS://Example.com/",
  ]) {
    assert.strictEqual(isSafeLinkUrl(url), true, url);
  }
});

test("isSafeLinkUrl rejects non-http(s) schemes", () => {
  const { isSafeLinkUrl } = loadOptionsSandbox();
  for (const url of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://example.com/",
    "mailto:a@example.com",
    "chrome://settings",
    "example.com/page",
    "",
    null,
    undefined,
    123,
  ]) {
    assert.strictEqual(isSafeLinkUrl(url), false, String(url));
  }
});

test("exportToHtml renders safe URL as anchor", () => {
  const { exportToHtml } = loadOptionsSandbox();
  const { content } = exportToHtml([
    makeJumpmark("javascript:alert(1)"),
    makeJumpmark("https://example.com/ok"),
  ]);

  assert.ok(
    content.includes(
      '<a href="https://example.com/ok" class="jumpmark-url" target="_blank">https://example.com/ok</a>',
    ),
  );
  // アイコン・タイトルの出力は従来どおり
  assert.ok(
    content.includes(
      '<span class="jumpmark-title">Title &amp; &lt;b&gt;</span>',
    ),
  );
});

test("exportToHtml renders unsafe URL as span without href", () => {
  const { exportToHtml } = loadOptionsSandbox();
  const { content } = exportToHtml([
    makeJumpmark("javascript:alert(1)"),
    makeJumpmark("https://example.com/ok"),
  ]);

  assert.ok(
    content.includes(
      '<span class="jumpmark-url jumpmark-url-unsafe">javascript:alert(1)</span>',
    ),
  );
  assert.strictEqual(content.split("<a ").length - 1, 1);
  assert.strictEqual(
    content.toLowerCase().includes('href="javascript:'),
    false,
  );
});

test("exportToHtml style contains unsafe-link rules", () => {
  const { exportToHtml } = loadOptionsSandbox();
  const { content } = exportToHtml([makeJumpmark("https://example.com/")]);

  assert.ok(content.includes(".jumpmark-url-unsafe { color: #666; }"));
  assert.ok(
    content.includes(".jumpmark-url-unsafe:hover { text-decoration: none; }"),
  );
});

test("exportToHtml escapes unsafe URL text", () => {
  const { exportToHtml } = loadOptionsSandbox();
  const { content } = exportToHtml([makeJumpmark('javascript:alert("x")')]);

  assert.ok(
    content.includes(
      '<span class="jumpmark-url jumpmark-url-unsafe">javascript:alert(&quot;x&quot;)</span>',
    ),
  );
});
