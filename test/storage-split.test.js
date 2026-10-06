// storage.sync を複数の項目（バケット）に分けて保存する仕組み（#30）を、chrome のスタブ越しに確かめる。
// テスト名の AC-n は Issue #30 の受入基準の番号
const test = require("node:test");
const assert = require("node:assert");
const vm = require("node:vm");
const {
  plain,
  readSource,
  createSyncStub,
  createFakeTimers,
} = require("./helpers/sync-stub");

// shared.js / i18n.js を読み込んだ sandbox（1 sandbox に 1 回だけ読む）
function load(items = {}) {
  const stub = createSyncStub(items);
  const timers = createFakeTimers();
  const state = Object.assign(stub.state, {
    timers,
    listeners: [],
    log: { error: [], warn: [], log: [] },
  });
  const sandbox = {
    console: {
      ...console,
      error: (...a) => state.log.error.push(a),
      warn: (...a) => state.log.warn.push(a),
      log: (...a) => state.log.log.push(a),
    },
    URL,
    TextEncoder,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }) },
    document: {
      createElement: () => ({}),
      getElementById: () => ({
        classList: { add() {}, remove() {}, contains: () => false },
        addEventListener() {},
      }),
      querySelectorAll: () => [],
      addEventListener: () => {},
      documentElement: {},
    },
    chrome: {
      i18n: { getMessage: (key) => key },
      storage: {
        onChanged: { addListener: (l) => state.listeners.push(l) },
        sync: stub.sync,
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(readSource("shared.js"), sandbox);
  vm.runInContext(readSource("i18n.js"), sandbox);
  let nextId = 0;
  sandbox.generateUniqueId = () => `gen${++nextId}`;
  return { sandbox, state };
}

const constant = (sandbox, name) => vm.runInContext(name, sandbox);
const utf8 = (s) => Buffer.byteLength(s, "utf8");
const itemBytes = (key, value) => utf8(key) + utf8(JSON.stringify(value));
const totalBytes = (items) =>
  Object.entries(items).reduce((sum, [k, v]) => sum + itemBytes(k, v), 0);
const noLogs = (state) => {
  assert.strictEqual(state.log.error.length, 0);
  assert.strictEqual(state.log.warn.length, 0);
  assert.strictEqual(state.log.log.length, 0);
};

const J = (id, extra = {}) => ({
  id,
  title: `title-${id}`,
  url: "https://t.com",
  sourceUrl: "a.com",
  ...extra,
});
const J1 = J("j1");
const J2 = J("j2", { sourceUrl: "b.com" });

// 旧形式（v2.3.0 以前）の jumpmarks の値
const legacyData = () => ({
  "a.com": [J("1"), J("2")],
  "b.com": [J("3", { sourceUrl: "b.com" })],
});

// 1 件が約 200 バイトの Jumpmark
const bigJumpmark = (i) => ({
  id: `big${i}`,
  title: "t".repeat(130),
  url: "https://example.com/page",
  sourceUrl: "a.com",
  created: "2025-01-01T00:00:00.000Z",
});
const bigList = (n) => Array.from({ length: n }, (_, i) => bigJumpmark(i));

// "jm:7" の項目がちょうど bytes になる 1 件の Jumpmark（4 + 30 + 文字数）
const jumpmarkForBucket7Bytes = (bytes) => ({ title: "x".repeat(bytes - 34) });

// 値が JSON で bytes - key のバイト数になる項目（キー + 値 = bytes）
const valueWithBytes = (key, bytes) => "x".repeat(bytes - utf8(key) - 2);

// ---- 定数・純粋関数 ----

test("AC-1: constants", () => {
  const { sandbox } = load();
  const values = [
    "SYNC_QUOTA_BYTES",
    "SYNC_QUOTA_BYTES_PER_ITEM",
    "SYNC_MAX_ITEMS",
    "JUMPMARKS_BUCKET_COUNT",
    "JUMPMARKS_CHANGE_NOTIFY_DELAY_MS",
  ].map((name) => constant(sandbox, name));
  assert.deepStrictEqual(values, [102400, 8192, 512, 64, 100]);
});

test("AC-2: FNV-1a vectors and bucket index", () => {
  const { sandbox } = load();
  assert.strictEqual(sandbox.hashStringFnv1a(""), "811c9dc5");
  assert.strictEqual(sandbox.hashStringFnv1a("a"), "e40c292c");
  assert.strictEqual(sandbox.hashStringFnv1a("foobar"), "bf9cf968");
  assert.strictEqual(sandbox.getJumpmarksBucketIndex("a.com"), 7);
  assert.strictEqual(sandbox.getJumpmarksBucketIndex("b.com"), 2);
});

test("AC-3: item bytes ASCII/Japanese/emoji", () => {
  const { sandbox } = load();
  assert.strictEqual(sandbox.calculateStorageItemBytes("k", "ab"), 1 + 4);
  assert.strictEqual(
    sandbox.calculateStorageItemBytes("鍵", "日本"),
    3 + 2 + 6,
  );
  assert.strictEqual(sandbox.calculateStorageItemBytes("k", "🔖"), 1 + 2 + 4);
  assert.strictEqual(sandbox.calculateStorageItemsBytes({}), 0);
  assert.strictEqual(
    sandbox.calculateStorageItemsBytes({ k: "ab", 鍵: "日本" }),
    5 + 11,
  );
});

test("AC-4: buildJumpmarksStorageItems basics", () => {
  const { sandbox } = load();
  assert.deepStrictEqual(
    plain(sandbox.buildJumpmarksStorageItems({ "a.com": [J1] })),
    { "jm:7": { d: { "a.com": [J1] } } },
  );
  assert.deepStrictEqual(
    plain(sandbox.buildJumpmarksStorageItems({ "a.com": [], "b.com": [] })),
    {},
  );
  assert.deepStrictEqual(plain(sandbox.buildJumpmarksStorageItems({})), {});

  const input = { "b.com": [J2], "a.com": [J1] };
  const first = JSON.stringify(sandbox.buildJumpmarksStorageItems(input));
  const second = JSON.stringify(sandbox.buildJumpmarksStorageItems(input));
  assert.strictEqual(first, second);

  const deepFreeze = (value) => {
    if (value && typeof value === "object") {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  };
  const frozen = deepFreeze({ "a.com": bigList(60), "b.com": [J2] });
  const snapshot = JSON.stringify(frozen);
  sandbox.buildJumpmarksStorageItems(frozen);
  assert.strictEqual(JSON.stringify(frozen), snapshot);
});

test("AC-5: build splits over 8192 into continuation items", () => {
  const { sandbox } = load();
  const list = bigList(60);
  assert.ok(utf8(JSON.stringify({ d: { "a.com": list } })) > 8192);
  const items = plain(sandbox.buildJumpmarksStorageItems({ "a.com": list }));
  const keys = Object.keys(items);
  assert.strictEqual(keys[0], "jm:7");
  assert.ok(keys.length >= 2);
  keys.slice(1).forEach((key, i) => assert.strictEqual(key, `jm:7:${i + 1}`));
  for (const [key, value] of Object.entries(items)) {
    assert.ok(itemBytes(key, value) <= 8192, key);
    assert.strictEqual(value.r, items["jm:7"].r, key);
  }
  assert.strictEqual(items["jm:7"].n, keys.length);
  assert.match(items["jm:7"].r, /^[0-9a-f]{8}$/);
});

test("AC-6: isStorageQuotaExceeded boundaries", () => {
  const { sandbox } = load();
  assert.strictEqual(
    sandbox.isStorageQuotaExceeded({ k: valueWithBytes("k", 8192) }),
    false,
  );
  assert.strictEqual(
    sandbox.isStorageQuotaExceeded({ k: valueWithBytes("k", 8193) }),
    true,
  );

  const total = (sum) => {
    const items = {};
    let rest = sum;
    for (let i = 0; rest > 0; i++) {
      const bytes = Math.min(rest, 8192);
      items[`k${i}`] = valueWithBytes(`k${i}`, bytes);
      rest -= bytes;
    }
    return items;
  };
  assert.strictEqual(totalBytes(total(102400)), 102400);
  assert.strictEqual(sandbox.isStorageQuotaExceeded(total(102400)), false);
  assert.strictEqual(totalBytes(total(102401)), 102401);
  assert.strictEqual(sandbox.isStorageQuotaExceeded(total(102401)), true);

  const count = (n) =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, 1]));
  assert.strictEqual(sandbox.isStorageQuotaExceeded(count(512)), false);
  assert.strictEqual(sandbox.isStorageQuotaExceeded(count(513)), true);
});

test("AC-7: assertWithinStorageQuota and isStorageQuotaError", () => {
  const { sandbox } = load();
  assert.doesNotThrow(() =>
    sandbox.assertWithinStorageQuota({ k: valueWithBytes("k", 8192) }),
  );
  assert.throws(
    () => sandbox.assertWithinStorageQuota({ k: valueWithBytes("k", 8193) }),
    (error) => sandbox.isStorageQuotaError(error) === true,
  );
  assert.strictEqual(
    sandbox.isStorageQuotaError(new Error("MAX_ITEMS quota exceeded")),
    true,
  );
  assert.strictEqual(
    sandbox.isStorageQuotaError(new Error("QUOTA_BYTES quota exceeded")),
    true,
  );
  assert.strictEqual(sandbox.isStorageQuotaError(new Error("other")), false);
});

test("AC-8: calculateStorageUsagePercent", () => {
  const { sandbox } = load();
  assert.strictEqual(sandbox.calculateStorageUsagePercent(51200), 50);
  assert.strictEqual(sandbox.calculateStorageUsagePercent(102400), 100);
  assert.strictEqual(sandbox.calculateStorageUsagePercent(204800), 100);
});

// ---- 読み込み ----

test("AC-10: read composes buckets with one get(null)", async () => {
  const { sandbox, state } = load({
    "jm:7": { d: { "a.com": [J1] } },
    "jm:2": { d: { "b.com": [J2] } },
  });
  assert.deepStrictEqual(plain(await sandbox.readJumpmarksStore()), {
    "a.com": [J1],
    "b.com": [J2],
  });
  assert.deepStrictEqual(state.getCalls, [null]);
  assert.strictEqual(state.setCalls.length, 0);
  assert.strictEqual(state.removeCalls.length, 0);
  assert.deepStrictEqual(plain(await load().sandbox.readJumpmarksStore()), {});
});

test("AC-11: read rejects with same error, no logs", async () => {
  const { sandbox, state } = load();
  const error = new Error("boom");
  state.getError = error;
  await assert.rejects(sandbox.readJumpmarksStore(), (e) => e === error);
  noLogs(state);
});

test("AC-12: continuation buckets (5 cases)", async () => {
  const a = J("a");
  const b = J("b");
  const read = async (items) =>
    plain(await load(items).sandbox.readJumpmarksStore());

  // 整合している
  assert.deepStrictEqual(
    await read({
      "jm:7": { n: 2, r: "X", d: { "a.com": [a] } },
      "jm:7:1": { r: "X", d: { "a.com": [b] } },
    }),
    { "a.com": [a, b] },
  );
  // n: 1（または n なし）で古い続き項目が残っている
  for (const head of [
    { n: 1, r: "X", d: { "a.com": [a] } },
    { d: { "a.com": [a] } },
  ]) {
    assert.deepStrictEqual(
      await read({ "jm:7": head, "jm:7:1": { r: "X", d: { "a.com": [b] } } }),
      { "a.com": [a] },
    );
  }
  // 続き項目が無い
  assert.deepStrictEqual(
    await read({ "jm:7": { n: 2, r: "X", d: { "a.com": [a] } } }),
    { "a.com": [a] },
  );
  // r が食い違う: 連結し、同じ id は先に出たものだけ残す
  const dup = J("a", { title: "dup" });
  assert.deepStrictEqual(
    await read({
      "jm:7": { n: 2, r: "X", d: { "a.com": [a] } },
      "jm:7:1": { r: "Y", d: { "a.com": [dup, b] } },
    }),
    { "a.com": [a, b] },
  );
  // 先頭が無い
  assert.deepStrictEqual(
    await read({ "jm:7:1": { r: "X", d: { "a.com": [b] } } }),
    { "a.com": [b] },
  );
});

test("AC-13: non-bucket jm: keys are ignored", async () => {
  const { sandbox } = load({
    "jm:meta": { v: 2, legacyIds: [] },
    "jm:64": { d: { "a.com": [J1] } },
    "jm:abc": { d: { "a.com": [J1] } },
  });
  assert.deepStrictEqual(plain(await sandbox.readJumpmarksStore()), {});
});

// ---- 移行と新旧混在 ----

// 旧形式だけがある状態から、最初の書き込み（AC-15）まで進める
async function migrated() {
  const env = load({ jumpmarks: legacyData() });
  await env.sandbox.writeJumpmarksStore(await env.sandbox.readJumpmarksStore());
  return env;
}

test("AC-14: legacy-only read", async () => {
  const { sandbox, state } = load({ jumpmarks: legacyData() });
  assert.deepStrictEqual(
    plain(await sandbox.readJumpmarksStore()),
    legacyData(),
  );
  assert.strictEqual(state.setCalls.length, 0);
  assert.strictEqual(state.removeCalls.length, 0);
});

test("AC-15: first write migrates, legacy untouched", async () => {
  const { sandbox, state } = await migrated();
  assert.strictEqual(state.setCalls.length, 1);
  const call = state.setCalls[0];
  assert.deepStrictEqual(call["jm:meta"], { v: 2, legacyIds: ["1", "2", "3"] });
  assert.deepStrictEqual(Object.keys(call).sort(), ["jm:2", "jm:7", "jm:meta"]);
  assert.ok(!("jumpmarks" in call));
  assert.strictEqual(state.removeCalls.length, 0);
  assert.deepStrictEqual(state.items.jumpmarks, legacyData());
  assert.deepStrictEqual(
    plain(await sandbox.readJumpmarksStore()),
    legacyData(),
  );
});

test("AC-16: set failure leaves legacy readable", async () => {
  const { sandbox, state } = load({ jumpmarks: legacyData() });
  const error = new Error("set failed");
  state.setError = error;
  const before = plain(state.items);
  const data = await sandbox.readJumpmarksStore();
  await assert.rejects(sandbox.writeJumpmarksStore(data), (e) => e === error);
  assert.strictEqual(state.removeCalls.length, 0);
  assert.deepStrictEqual(state.items, before);
  assert.deepStrictEqual(
    plain(await sandbox.readJumpmarksStore()),
    legacyData(),
  );
});

test("AC-17: second write is a no-op", async () => {
  const { sandbox, state } = await migrated();
  const before = plain(state.items);
  state.setCalls.length = 0;
  await sandbox.writeJumpmarksStore(await sandbox.readJumpmarksStore());
  assert.strictEqual(state.setCalls.length, 0);
  assert.strictEqual(state.removeCalls.length, 0);
  assert.deepStrictEqual(state.items, before);
});

test("stableStringify ignores object key order at every depth", () => {
  const { sandbox } = load();
  const a = { b: 1, a: { d: [{ y: 1, x: 2 }], c: 3 } };
  const b = { a: { c: 3, d: [{ x: 2, y: 1 }] }, b: 1 };
  assert.strictEqual(sandbox.stableStringify(a), sandbox.stableStringify(b));
  // 配列の順は意味を持つので区別する
  assert.notStrictEqual(
    sandbox.stableStringify([1, 2]),
    sandbox.stableStringify([2, 1]),
  );
  assert.strictEqual(sandbox.stableStringify(undefined), undefined);
});

// chrome.storage は読み返すときにキーを並べ替えるので、書いたときとキーの順が違っても
// 内容が同じなら書き直さない（jm:meta もバケットも）
test("same content with a different key order is not rewritten", async () => {
  const { sandbox, state } = load();
  await sandbox.writeJumpmarksStore({ "a.com": [J1] });
  assert.strictEqual(state.setCalls.length, 1);

  const reordered = {
    sourceUrl: J1.sourceUrl,
    url: J1.url,
    title: J1.title,
    id: J1.id,
  };
  await sandbox.writeJumpmarksStore({ "a.com": [reordered] });
  assert.strictEqual(state.setCalls.length, 1);
  assert.strictEqual(state.removeCalls.length, 0);
});

test("AC-18: deleted id is not revived by a legacy write-back", async () => {
  const { sandbox, state } = await migrated();
  await sandbox.deleteJumpmark("1");
  state.items.jumpmarks = legacyData();
  const result = plain(await sandbox.readJumpmarksStore());
  assert.ok(!JSON.stringify(result).includes('"id":"1"'));
});

test("AC-19: legacy addition appears and is recorded", async () => {
  const { sandbox, state } = await migrated();
  state.items.jumpmarks["a.com"].push(J("4"));
  const read = plain(await sandbox.readJumpmarksStore());
  assert.strictEqual(read["a.com"].at(-1).id, "4");
  state.setCalls.length = 0;
  await sandbox.writeJumpmarksStore(await sandbox.readJumpmarksStore());
  assert.deepStrictEqual(state.items["jm:meta"].legacyIds, [
    "1",
    "2",
    "3",
    "4",
  ]);
  assert.ok(state.items["jm:7"].d["a.com"].some((j) => j.id === "4"));
});

test("AC-20: legacy edit is not reflected", async () => {
  const { sandbox, state } = await migrated();
  state.items.jumpmarks["a.com"][1].title = "edited in old version";
  const read = plain(await sandbox.readJumpmarksStore());
  assert.strictEqual(read["a.com"].find((j) => j.id === "2").title, "title-2");
});

test("AC-21: id-less legacy jumpmark only without jm:meta", async () => {
  const legacy = { "a.com": [{ title: "no-id" }] };
  const without = load({ jumpmarks: legacy });
  assert.deepStrictEqual(
    plain(await without.sandbox.readJumpmarksStore()),
    legacy,
  );
  const withMeta = load({
    jumpmarks: legacy,
    "jm:meta": { v: 2, legacyIds: [] },
  });
  assert.deepStrictEqual(
    plain(await withMeta.sandbox.readJumpmarksStore()),
    {},
  );
});

test("AC-22: stub rejects the jumpmarks key", async () => {
  const stub = createSyncStub();
  await assert.rejects(stub.sync.set({ jumpmarks: {} }));
  await assert.rejects(stub.sync.remove(["jumpmarks"]));
  assert.strictEqual(stub.state.setCalls.length, 0);
  assert.strictEqual(stub.state.removeCalls.length, 0);
});

test("AC-61: legacyIds never shrinks (steps 1-6)", async () => {
  const { sandbox, state } = await migrated();
  // 1. 新バージョンで id "2" を削除
  await sandbox.deleteJumpmark("2");
  // 2. 旧バージョンの端末 A でも "2" を削除
  const withoutTwo = legacyData();
  withoutTwo["a.com"] = withoutTwo["a.com"].filter((j) => j.id !== "2");
  state.items.jumpmarks = withoutTwo;
  // 3. 新バージョンで保存
  const setsBefore = state.setCalls.length;
  await sandbox.saveJumpmark({
    title: "new",
    url: "https://n.com",
    sourceUrl: "c.com",
  });
  assert.strictEqual(state.setCalls.length, setsBefore + 1);
  // 4. legacyIds に "2" が残っている
  assert.deepStrictEqual(state.items["jm:meta"].legacyIds, ["1", "2", "3"]);
  // 5. オフラインだった端末 B の書き戻し
  state.items.jumpmarks = legacyData();
  // 6. "2" は表示されない
  const result = plain(await sandbox.readJumpmarksStore());
  assert.ok(!JSON.stringify(result).includes('"id":"2"'));
});

test("AC-62: legacyIds is a union", async () => {
  const first = load({
    "jm:meta": { v: 2, legacyIds: ["9"] },
    jumpmarks: legacyData(),
  });
  await first.sandbox.writeJumpmarksStore(
    await first.sandbox.readJumpmarksStore(),
  );
  assert.deepStrictEqual(first.state.setCalls[0]["jm:meta"], {
    v: 2,
    legacyIds: ["1", "2", "3", "9"],
  });

  const second = load({ "jm:meta": { v: 2, legacyIds: ["9"] } });
  await second.sandbox.writeJumpmarksStore({ "a.com": [J1] });
  assert.ok(!("jm:meta" in second.state.setCalls[0]));
});

test("AC-63: broken jm:meta", async () => {
  const legacy = () => ({ "a.com": [J("1"), { title: "no-id" }] });
  const expectMeta = { v: 2, legacyIds: ["1"] };

  for (const broken of ["broken", null, ["x"]]) {
    const { sandbox, state } = load({ "jm:meta": broken, jumpmarks: legacy() });
    const read = plain(await sandbox.readJumpmarksStore());
    assert.strictEqual(read["a.com"].length, 2);
    await sandbox.writeJumpmarksStore(read);
    assert.deepStrictEqual(state.setCalls[0]["jm:meta"], expectMeta);
  }

  {
    const { sandbox, state } = load({
      "jm:meta": { v: 2, legacyIds: "x" },
      jumpmarks: legacy(),
    });
    const read = plain(await sandbox.readJumpmarksStore());
    assert.deepStrictEqual(
      read["a.com"].map((j) => j.id),
      ["1"],
    );
    await sandbox.writeJumpmarksStore(read);
    assert.deepStrictEqual(state.setCalls[0]["jm:meta"], expectMeta);
  }

  {
    const { sandbox, state } = load({
      "jm:meta": { v: 2, legacyIds: [1, "", null, "1"] },
      jumpmarks: legacy(),
    });
    const read = plain(await sandbox.readJumpmarksStore());
    assert.deepStrictEqual(read, {});
    await sandbox.writeJumpmarksStore(read);
    assert.deepStrictEqual(state.setCalls[0]["jm:meta"], expectMeta);
  }
});

// ---- 書き込み ----

test("AC-23: first write to empty store", async () => {
  const { sandbox, state } = load();
  await sandbox.writeJumpmarksStore({ "a.com": [J1] });
  assert.deepStrictEqual(state.getCalls, [null]);
  assert.deepStrictEqual(state.setCalls, [
    {
      "jm:7": { d: { "a.com": [J1] } },
      "jm:meta": { v: 2, legacyIds: [] },
    },
  ]);
  assert.strictEqual(state.removeCalls.length, 0);
});

test("AC-24: only the changed bucket is set", async () => {
  const { sandbox, state } = load();
  await sandbox.writeJumpmarksStore({ "a.com": [J1] });
  state.setCalls.length = 0;
  await sandbox.writeJumpmarksStore({ "a.com": [J1], "b.com": [J2] });
  assert.deepStrictEqual(Object.keys(state.setCalls[0]), ["jm:2"]);
});

test("AC-25: emptied bucket is set empty, then removed after set resolves", async () => {
  const { sandbox, state } = load();
  await sandbox.writeJumpmarksStore({ "a.com": [J1], "b.com": [J2] });
  state.setCalls.length = 0;
  const order = [];
  const { set, remove } = sandbox.chrome.storage.sync;
  sandbox.chrome.storage.sync.set = async (value) => {
    order.push("set:start");
    await set(value);
    order.push("set:end");
  };
  sandbox.chrome.storage.sync.remove = async (keys) => {
    order.push("remove");
    await remove(keys);
  };
  await sandbox.writeJumpmarksStore({ "a.com": [J1] });
  assert.deepStrictEqual(state.setCalls, [{ "jm:2": { d: {} } }]);
  assert.deepStrictEqual(state.removeCalls, [["jm:2"]]);
  assert.deepStrictEqual(order, ["set:start", "set:end", "remove"]);
  assert.ok(!("jm:2" in state.items));
});

test("AC-26: remove failure only warns", async () => {
  const { sandbox, state } = load();
  await sandbox.writeJumpmarksStore({ "a.com": [J1], "b.com": [J2] });
  state.removeError = new Error("remove failed");
  await sandbox.writeJumpmarksStore({ "a.com": [J1] });
  assert.strictEqual(state.log.warn.length, 1);
  assert.deepStrictEqual(plain(await sandbox.readJumpmarksStore()), {
    "a.com": [J1],
  });
});

test("AC-27: shrinking a bucket clears continuation items", async () => {
  const { sandbox, state } = load();
  await sandbox.writeJumpmarksStore(
    { "a.com": bigList(100) },
    { checkQuota: false },
  );
  assert.ok("jm:7:2" in state.items);
  state.setCalls.length = 0;
  await sandbox.writeJumpmarksStore({ "a.com": [J1] });
  const call = state.setCalls[0];
  assert.deepStrictEqual(call["jm:7"], { d: { "a.com": [J1] } });
  assert.deepStrictEqual(call["jm:7:1"], { r: "", d: {} });
  assert.deepStrictEqual(call["jm:7:2"], { r: "", d: {} });
  assert.strictEqual(state.removeCalls.length, 1);
  assert.ok(state.removeCalls[0].includes("jm:7:1"));
  assert.ok(state.removeCalls[0].includes("jm:7:2"));
});

test("AC-28: set failure rejects, no remove, no logs", async () => {
  const { sandbox, state } = load();
  await sandbox.writeJumpmarksStore({ "a.com": [J1], "b.com": [J2] });
  const error = new Error("set failed");
  state.setError = error;
  await assert.rejects(
    sandbox.writeJumpmarksStore({ "a.com": [J1] }),
    (e) => e === error,
  );
  assert.strictEqual(state.removeCalls.length, 0);
  noLogs(state);
});

test("AC-29: per-item boundary 8192/8193", async () => {
  const ok = load();
  const fits = jumpmarkForBucket7Bytes(8192);
  assert.strictEqual(
    ok.sandbox.calculateStorageItemBytes("jm:7", { d: { "a.com": [fits] } }),
    8192,
  );
  await ok.sandbox.writeJumpmarksStore({ "a.com": [fits] });
  assert.strictEqual(ok.state.setCalls.length, 1);

  const over = load();
  await assert.rejects(
    over.sandbox.writeJumpmarksStore({
      "a.com": [jumpmarkForBucket7Bytes(8193)],
    }),
    (e) => over.sandbox.isStorageQuotaError(e) === true,
  );
  assert.strictEqual(over.state.setCalls.length, 0);
});

test("AC-30: write and read back over 8192 for one URL", async () => {
  const { sandbox, state } = load();
  const list = bigList(60);
  await sandbox.writeJumpmarksStore({ "a.com": list });
  assert.strictEqual(state.setCalls.length, 1);
  for (const [key, value] of Object.entries(state.setCalls[0])) {
    assert.ok(itemBytes(key, value) <= 8192, key);
  }
  assert.deepStrictEqual(plain(await sandbox.readJumpmarksStore()), {
    "a.com": list,
  });
});

// 全体の合計を大きくするための、jm: でも jumpmarks でもない既存項目（上限判定の対象は今回 set する項目だけ）
const fillerItems = (count, bytes = 8000) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `f${i}`,
      valueWithBytes(`f${i}`, bytes),
    ]),
  );

test("AC-31: total boundary 102400/102401 including the legacy item", async () => {
  const initial = () => ({ ...fillerItems(12), jumpmarks: legacyData() });
  const writeWith = async (padding) => {
    const env = load(initial());
    const promise = env.sandbox.writeJumpmarksStore({
      "a.com": [{ id: "p", title: "x".repeat(padding) }],
    });
    return { env, promise };
  };

  // 余白 0 で書いたときの全体の大きさから、ちょうど 102,400 になる余白を求める
  const dry = await writeWith(0);
  await dry.promise;
  const base = totalBytes(dry.env.state.items);
  const padding = 102400 - base;
  assert.ok(padding > 0 && padding < 8000, String(padding));
  assert.ok("jumpmarks" in dry.env.state.items);

  const exact = await writeWith(padding);
  await exact.promise;
  assert.strictEqual(totalBytes(exact.env.state.items), 102400);
  assert.strictEqual(exact.env.state.setCalls.length, 1);

  const over = await writeWith(padding + 1);
  await assert.rejects(
    over.promise,
    (e) => over.env.sandbox.isStorageQuotaError(e) === true,
  );
  assert.strictEqual(over.env.state.setCalls.length, 0);
});

test("AC-32: 600 URLs fit in at most 80 items", async () => {
  const { sandbox, state } = load();
  const data = {};
  for (let i = 0; i < 600; i++) {
    data[`site${i}.example.com`] = [
      J(`id${i}`, { sourceUrl: `site${i}.example.com` }),
    ];
  }
  await sandbox.writeJumpmarksStore(data);
  assert.strictEqual(state.setCalls.length, 1);
  assert.ok(Object.keys(state.items).length <= 80);
  assert.strictEqual(
    Object.keys(plain(await sandbox.readJumpmarksStore())).length,
    600,
  );
});

test("AC-33: item count is judged after the write", async () => {
  const { sandbox, state } = load(fillerItems(511, 10));
  await assert.rejects(
    sandbox.writeJumpmarksStore({ "a.com": [J1], "b.com": [J2] }),
    (e) => sandbox.isStorageQuotaError(e) === true,
  );
  assert.strictEqual(state.setCalls.length, 0);
});

test("AC-34: checkQuota false skips the judgment", async () => {
  const { sandbox, state } = load(fillerItems(14));
  await sandbox.writeJumpmarksStore({ "a.com": [J1] }, { checkQuota: false });
  assert.strictEqual(state.setCalls.length, 1);
});

// ---- 削除・保存・インポートの経路 ----

test("AC-35: deletes succeed over quota, without quota checks", async () => {
  const stored = () => {
    const env = load(fillerItems(14));
    return env;
  };
  for (const [name, args] of [
    ["deleteJumpmark", ["d1"]],
    ["deleteBidirectionalPair", ["d1", "none"]],
    ["deleteJumpmarks", [["d1"]]],
  ]) {
    const { sandbox, state } = stored();
    await sandbox.writeJumpmarksStore(
      { "a.com": [J("d1"), J("d2")] },
      { checkQuota: false },
    );
    state.setCalls.length = 0;
    assert.ok(totalBytes(state.items) > 102400);
    await sandbox[name](...args);
    assert.strictEqual(state.setCalls.length, 1, name);
    assert.ok(
      !sandbox[name].toString().includes("assertWithinStorageQuota"),
      name,
    );
  }
});

test("AC-36: multi-bucket operations use at most one set and one remove", async () => {
  const check = (state, label) => {
    assert.ok(state.setCalls.length <= 1, `${label} set`);
    assert.ok(state.removeCalls.length <= 1, `${label} remove`);
  };

  const save = load();
  await save.sandbox.saveJumpmark({
    title: "t",
    url: "https://b.com",
    sourceUrl: "a.com",
    createBidirectional: true,
  });
  assert.strictEqual(save.state.setCalls.length, 1);
  check(save.state, "saveJumpmark");

  const update = load();
  await update.sandbox.writeJumpmarksStore({ "a.com": [J("u1")] });
  update.state.setCalls.length = 0;
  await update.sandbox.updateJumpmark("u1", {
    sourceUrl: "b.com",
    createBidirectional: false,
  });
  assert.strictEqual(update.state.setCalls.length, 1);
  check(update.state, "updateJumpmark");

  const del = load();
  await del.sandbox.writeJumpmarksStore({
    "a.com": [J("d1")],
    "b.com": [J("d2")],
    "c.com": [J("d3")],
  });
  del.state.setCalls.length = 0;
  await del.sandbox.deleteJumpmarks(["d1", "d2", "d3"]);
  check(del.state, "deleteJumpmarks");
  assert.deepStrictEqual(plain(await del.sandbox.readJumpmarksStore()), {});
});

// ---- 変更の監視 ----

test("AC-38: onJumpmarksChanged registers synchronously once", () => {
  const { sandbox, state } = load();
  sandbox.onJumpmarksChanged(() => {});
  assert.strictEqual(state.listeners.length, 1);
});

test("AC-39: irrelevant changes never notify", () => {
  const { sandbox, state } = load();
  let calls = 0;
  sandbox.onJumpmarksChanged(() => calls++);
  const [listener] = state.listeners;
  listener({ "jm:7": { newValue: {} } }, "local");
  listener({ other: { newValue: 1 } }, "sync");
  state.timers.advance(500);
  assert.strictEqual(calls, 0);
});

test("AC-40: notifies after 100ms with no arguments", () => {
  for (const changes of [
    { "jm:7": {} },
    { jumpmarks: {} },
    { "jm:meta": {} },
  ]) {
    const { sandbox, state } = load();
    const calls = [];
    sandbox.onJumpmarksChanged((...args) => calls.push(args));
    state.listeners[0](changes, "sync");
    assert.strictEqual(calls.length, 0);
    state.timers.advance(99);
    assert.strictEqual(calls.length, 0);
    state.timers.advance(1);
    assert.deepStrictEqual(calls, [[]]);
  }
});

test("AC-41: coalesces changes, then re-arms", () => {
  const { sandbox, state } = load();
  let calls = 0;
  sandbox.onJumpmarksChanged(() => calls++);
  const [listener] = state.listeners;
  listener({ "jm:7": {}, "jm:2": {} }, "sync");
  state.timers.advance(50);
  listener({ "jm:2": {} }, "sync");
  state.timers.advance(50);
  assert.strictEqual(calls, 1);
  state.timers.advance(500);
  assert.strictEqual(calls, 1);
  listener({ "jm:7": {} }, "sync");
  state.timers.advance(100);
  assert.strictEqual(calls, 2);
});

// ---- 容量の表示 ----

test("AC-43: readStorageUsageBytes", async () => {
  const items = {
    jumpmarks: legacyData(),
    "jm:meta": { v: 2, legacyIds: ["1"] },
    "jm:7": { d: { "a.com": [J1] } },
  };
  const { sandbox, state } = load(items);
  assert.strictEqual(await sandbox.readStorageUsageBytes(), totalBytes(items));
  const error = new Error("boom");
  state.getError = error;
  await assert.rejects(sandbox.readStorageUsageBytes(), (e) => e === error);
});

test("AC-44: getStorageStats", async () => {
  const items = {
    "jm:7": { d: { "a.com": [J1, J("j3", { bidirectional: true })] } },
    "jm:2": { d: { "b.com": [J2] } },
  };
  const { sandbox, state } = load(items);
  const stats = plain(await sandbox.getStorageStats());
  assert.deepStrictEqual(Object.keys(stats).sort(), [
    "bidirectionalJumpmarks",
    "bytesUsed",
    "originalJumpmarks",
    "quotaBytes",
    "totalJumpmarks",
    "urlCount",
    "usagePercent",
  ]);
  assert.strictEqual(stats.bytesUsed, totalBytes(items));
  assert.strictEqual(stats.quotaBytes, 102400);
  assert.strictEqual(stats.usagePercent, (totalBytes(items) / 102400) * 100);
  assert.strictEqual(stats.totalJumpmarks, 3);
  assert.strictEqual(stats.urlCount, 2);
  assert.strictEqual(stats.bidirectionalJumpmarks, 1);

  state.getError = new Error("boom");
  const failed = plain(await sandbox.getStorageStats());
  assert.strictEqual(failed.totalJumpmarks, 0);
  assert.strictEqual(failed.urlCount, 0);
  assert.strictEqual(failed.bytesUsed, 0);
  assert.strictEqual(failed.usagePercent, 0);
  assert.strictEqual(failed.quotaBytes, 102400);
});

// ---- 文言・ドキュメント ----

const messages = (locale) =>
  JSON.parse(readSource(`_locales/${locale}/messages.json`));

test("AC-47: ja messages exact", () => {
  const m = messages("ja");
  assert.strictEqual(
    m.popupStorageAlmostFull.message,
    "保存容量の上限（100KB）の$1%を使用しています。上限に達すると保存できなくなります。不要なJumpmarkを削除してください。",
  );
  assert.strictEqual(
    m.errorStorageQuotaExceeded.message,
    "保存できる容量の上限（全体で100KB、Jumpmark 1件あたり約8KB）を超えるため保存できません。不要なJumpmarkを削除するか、タイトルやURLを短くしてから、もう一度お試しください。",
  );
  assert.strictEqual(
    m.warnStorageAlmostFull.message,
    "保存容量の上限（100KB）に近づいています。不要なJumpmarkを削除してください。",
  );
});

test("AC-48: en messages exact", () => {
  const m = messages("en");
  assert.strictEqual(
    m.popupStorageAlmostFull.message,
    "$1% of the storage limit (100KB) is in use. You won't be able to save once it's full. Delete Jumpmarks you no longer need.",
  );
  assert.strictEqual(
    m.errorStorageQuotaExceeded.message,
    "Can't save because the data would exceed the storage limit (100KB in total, about 8KB per Jumpmark). Delete Jumpmarks you no longer need or shorten the title or URL, then try again.",
  );
  assert.strictEqual(
    m.warnStorageAlmostFull.message,
    "Storage is almost full (limit: 100KB). Delete Jumpmarks you no longer need.",
  );
});

test("AC-49: only errorStorageQuotaExceeded mentions 8KB", () => {
  for (const locale of ["ja", "en"]) {
    const lines = readSource(`_locales/${locale}/messages.json`)
      .split("\n")
      .filter((line) => line.includes("8KB"));
    assert.strictEqual(lines.length, 1, locale);
    assert.ok(lines[0].includes('"errorStorageQuotaExceeded"'), locale);
  }
});

test("AC-50..53: docs contain the required statements", () => {
  const readme = readSource("README.md");
  assert.ok(!readme.includes("約8KBが上限"));
  const limit = readme.slice(
    readme.indexOf("## 同期と保存容量"),
    readme.indexOf("## 開発"),
  );
  assert.ok(limit.startsWith("## 同期と保存容量"));
  for (const text of [
    "102,400",
    "8,192",
    "512",
    "64",
    "100KB",
    "8KB",
    "jumpmarks",
  ]) {
    assert.ok(limit.includes(text), text);
  }
  assert.ok(!limit.includes("作成元URLごとに複数の項目"));
  const structure = readme.slice(readme.indexOf("### データ構造"));
  for (const text of ["jm:<番号>", "jm:<番号>:<i>", "jm:meta", "jumpmarks"]) {
    assert.ok(structure.includes(text), text);
  }

  const claude = readSource("CLAUDE.md");
  assert.ok(!claude.includes("effective limit is ~8KB"));
  assert.ok(claude.includes("jm:meta") && claude.includes("~100KB"));

  const changelog = readSource("CHANGELOG.md");
  const section = changelog.slice(
    changelog.indexOf("## [Unreleased]"),
    changelog.indexOf("## [2.3.0]"),
  );
  assert.ok(section.includes("100KB"));
  assert.ok(section.includes("既存ユーザーへの影響"));
  assert.ok(section.includes("並び順の変化"));
});
