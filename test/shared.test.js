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
const { parseUrlPattern } = sandbox;

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
