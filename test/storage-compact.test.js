// 詰めた保存形式（#37 段階 1）を読めること、書き込みは今の形のままであることを確かめる。
// テスト名の AC-n は Issue #37 の指示書の受入基準の番号（AC-18 は欠番）
const test = require("node:test");
const assert = require("node:assert");
const vm = require("node:vm");
const { plain, readSource, createSyncStub } = require("./helpers/sync-stub");

// shared.js を読み込んだ sandbox（1 sandbox に 1 回だけ読む）
function load(items = {}) {
  const stub = createSyncStub(items);
  const state = stub.state;
  const sandbox = {
    console: { ...console, error() {}, warn() {}, log() {} },
    URL,
    TextEncoder,
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
        onChanged: { addListener() {} },
        sync: stub.sync,
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(readSource("shared.js"), sandbox);
  let nextId = 0;
  sandbox.generateUniqueId = () => `gen${++nextId}`;
  return { sandbox, state };
}

const pure = load().sandbox;
const utf8 = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");
const constant = (name) => vm.runInContext(name, pure);
const bucketOfKey = (key) => Number(/^jm:(\d+)/.exec(key)[1]);
const bucketOfUrl = (url) => pure.getJumpmarksBucketIndex(url);

const ISO = "2026-10-02T12:34:56.789Z";
const EPOCH_MS = 1790944496789;
const ISSUE_EXAMPLE = {
  id: "m1abc2de-x7k9qz",
  title: "2026/06/22 – skpn @maepon",
  url: "https://maepon.blog/2026-06-22/",
  icon: "🔖",
  sourceUrl: "maepon.blog",
  created: ISO,
};

// ---- テストデータ ----

// 偶数番号のバケットと奇数番号のバケットに入る作成元 URL を 4 個ずつ選ぶ（それぞれ先頭はワイルドカード）
function pickUrls() {
  const picked = { even: [], odd: [] };
  const used = new Set();
  for (let n = 0; picked.even.length < 4 || picked.odd.length < 4; n++) {
    const kind = (list) => (list.length === 0 ? `s${n}.com/d*` : `s${n}.com`);
    for (const group of ["even", "odd"]) {
      const url = kind(picked[group]);
      const bucket = bucketOfUrl(url);
      const parity = bucket % 2 === 0 ? "even" : "odd";
      if (parity !== group || used.has(bucket) || picked[group].length >= 4) {
        continue;
      }
      used.add(bucket);
      picked[group].push(url);
    }
  }
  return picked;
}

// 作成元 URL 1 つ分の Jumpmark（🔖 / 🔗 / 戻せない created と表に無いプロパティ / icon なし）
function entriesFor(url, tag) {
  const wildcard = url.endsWith("*");
  const make = (i, extra) => ({
    id: `${tag}-${i}`,
    title: `T ${tag} ${i}`,
    url: `https://t.com/${tag}/${i}`,
    sourceUrl: url,
    created: ISO,
    ...extra,
    ...(wildcard ? { isWildcard: true } : {}),
  });
  return [
    make(1, { icon: "🔖" }),
    make(2, { icon: "🔗" }),
    make(3, {
      icon: "🔗",
      created: "2025-06-30T10:00:00Z",
      bidirectional: true,
      updated: "2026-01-01",
    }),
    make(4, {}),
  ];
}

const urls = pickUrls();
const allUrls = [...urls.even, ...urls.odd];
const makeData = () =>
  Object.fromEntries(allUrls.map((url, i) => [url, entriesFor(url, `u${i}`)]));

// 続き項目が出る大きさのバケット（長い title の Jumpmark を多数並べる）
const BIG_URL = "big.example.com";
function makeBigData() {
  const list = Array.from({ length: 60 }, (_, i) => ({
    id: `b${i}`,
    title: `${"t".repeat(150)}${i}`,
    url: `https://big.example.com/${i}`,
    icon: i % 2 ? "🔖" : "🔗",
    sourceUrl: BIG_URL,
    created: ISO,
  }));
  return { ...makeData(), [BIG_URL]: list };
}

// 今の形で保存した項目群
const currentItems = (data) => plain(pure.buildJumpmarksStorageItems(data));

// 詰めた形のストア：compactBucket(bucket) が真のバケットの全項目の d を詰めて f: 1 を付ける
function compactItems(data, compactBucket = () => true) {
  const items = currentItems(data);
  for (const [key, item] of Object.entries(items)) {
    if (!compactBucket(bucketOfKey(key))) continue;
    item.d = plain(pure.compactBucketData(item.d));
    item.f = 1;
  }
  return items;
}

const META = { "jm:meta": { v: 2, legacyIds: [] } };
const read = async (items) =>
  plain(await load(items).sandbox.readJumpmarksStore());

// ---- 定数・変換関数 ----

test("AC-1: constants", () => {
  assert.strictEqual(constant("JUMPMARKS_COMPACT_FORMAT"), 1);
  assert.strictEqual(constant("DEFAULT_JUMPMARK_ICON"), "🔗");
});

test("AC-2: functions are defined", () => {
  for (const name of [
    "compactJumpmark",
    "expandJumpmark",
    "compactBucketData",
    "expandBucketData",
    "isCompactJumpmarkEntry",
  ]) {
    assert.strictEqual(typeof pure[name], "function", name);
  }
});

test("AC-3: Issue example compacts 179 -> 124 bytes", () => {
  const compact = plain(pure.compactJumpmark(ISSUE_EXAMPLE, "maepon.blog"));
  assert.deepStrictEqual(compact, {
    i: "m1abc2de-x7k9qz",
    t: "2026/06/22 – skpn @maepon",
    u: "https://maepon.blog/2026-06-22/",
    k: "🔖",
    c: EPOCH_MS,
  });
  assert.strictEqual(utf8(ISSUE_EXAMPLE), 179);
  assert.strictEqual(utf8(compact), 124);
});

test("AC-4: default icon compacts 179 -> 113 bytes", () => {
  const jumpmark = { ...ISSUE_EXAMPLE, icon: "🔗" };
  const compact = plain(pure.compactJumpmark(jumpmark, "maepon.blog"));
  assert.deepStrictEqual(compact, {
    i: "m1abc2de-x7k9qz",
    t: "2026/06/22 – skpn @maepon",
    u: "https://maepon.blog/2026-06-22/",
    c: EPOCH_MS,
  });
  assert.strictEqual(utf8(jumpmark), 179);
  assert.strictEqual(utf8(compact), 113);
});

const BASE = { id: "x1", title: "T", url: "https://t.com" };
const SHORT = { i: "x1", t: "T", u: "https://t.com" };
const COMPACT_CASES = [
  [{ ...BASE, sourceUrl: "a.com" }, "a.com", { ...SHORT, a: ["icon"] }],
  [{ ...BASE, icon: "", sourceUrl: "a.com" }, "a.com", { ...SHORT, k: "" }],
  [{ ...BASE, icon: "🔗" }, "a.com", { ...SHORT, a: ["sourceUrl"] }],
  [
    { ...BASE, icon: "🔗", sourceUrl: "b.com" },
    "a.com",
    { ...SHORT, x: { sourceUrl: "b.com" } },
  ],
  [
    {
      ...BASE,
      icon: "🔗",
      sourceUrl: "a.com",
      created: "2025-06-30T10:00:00Z",
    },
    "a.com",
    { ...SHORT, c: "2025-06-30T10:00:00Z" },
  ],
  [
    { ...BASE, icon: "🔗", sourceUrl: "a.com", created: 123 },
    "a.com",
    { ...SHORT, x: { created: 123 } },
  ],
  [
    { ...BASE, icon: "🔗", sourceUrl: "a.com/docs*", isWildcard: true },
    "a.com/docs*",
    SHORT,
  ],
  [
    { ...BASE, sourceUrl: "a.com/docs*" },
    "a.com/docs*",
    { ...SHORT, a: ["icon", "isWildcard"] },
  ],
  [
    { ...BASE, icon: "🔗", sourceUrl: "a.com", isWildcard: false },
    "a.com",
    { ...SHORT, x: { isWildcard: false } },
  ],
  [
    { ...BASE, icon: "🔗", sourceUrl: "a.com", bidirectional: true, t: "dup" },
    "a.com",
    { ...SHORT, x: { bidirectional: true, t: "dup" } },
  ],
  [
    { title: "T" },
    "a.com/x*",
    { t: "T", a: ["icon", "isWildcard", "sourceUrl"] },
  ],
  ["str", "a.com", "str"],
  [null, "a.com", null],
];

test("AC-5: compactJumpmark cases 1..12", () => {
  COMPACT_CASES.forEach(([input, key, expected], index) => {
    assert.deepStrictEqual(
      plain(pure.compactJumpmark(input, key)),
      expected,
      `case ${index + 1}`,
    );
  });
});

test("AC-6: round trip", () => {
  const withProto = JSON.parse(
    '{"id":"p1","title":"T","url":"https://t.com","__proto__":{"polluted":true}}',
  );
  const odd = {
    ...BASE,
    icon: "🔖",
    sourceUrl: "a.com",
    i: "i",
    u: "u",
    k: "k",
    c: "c",
    a: "a",
    x: "x",
    f: "f",
  };
  const cases = [
    [ISSUE_EXAMPLE, "maepon.blog"],
    [{ ...ISSUE_EXAMPLE, icon: "🔗" }, "maepon.blog"],
    ...COMPACT_CASES.filter(([input]) => typeof input === "object" && input),
    [withProto, "a.com"],
    [odd, "a.com"],
  ].map((c) => [c[0], c[1]]);

  cases.forEach(([jumpmark, key], index) => {
    const back = pure.expandJumpmark(pure.compactJumpmark(jumpmark, key), key);
    assert.deepStrictEqual(plain(back), plain(jumpmark), `case ${index}`);
    assert.deepStrictEqual(
      Object.keys(back).sort(),
      Object.keys(jumpmark).sort(),
      `keys of case ${index}`,
    );
  });

  const back = pure.expandJumpmark(
    pure.compactJumpmark(withProto, "a.com"),
    "a.com",
  );
  assert.strictEqual(
    Object.getPrototypeOf(back),
    vm.runInContext("Object.prototype", pure),
  );
  assert.ok(Object.keys(back).includes("__proto__"));
  assert.strictEqual(back.polluted, undefined);
});

test("AC-7: expandJumpmark edge cases", () => {
  const big = pure.expandJumpmark({ i: "x1", c: 8.64e15 + 1 }, "a.com");
  assert.strictEqual(big.created, 8640000000000001);

  assert.deepStrictEqual(
    plain(pure.expandJumpmark({ i: "x1", a: "icon" }, "a.com")),
    { id: "x1", icon: "🔗", sourceUrl: "a.com" },
  );
  assert.ok(!("zz" in pure.expandJumpmark({ i: "x1", zz: 1 }, "a.com")));
  assert.deepStrictEqual(plain(pure.expandJumpmark({ i: "x1" }, "a.com")), {
    id: "x1",
    icon: "🔗",
    sourceUrl: "a.com",
  });
  assert.deepStrictEqual(plain(pure.expandJumpmark({ i: "x1" }, "a.com*")), {
    id: "x1",
    icon: "🔗",
    sourceUrl: "a.com*",
    isWildcard: true,
  });
});

test("AC-8: bucket data compact/expand", () => {
  const data = {
    "a.com": [
      { ...BASE, icon: "🔖", sourceUrl: "a.com", created: ISO },
      { ...BASE, id: "x2", icon: "🔗", sourceUrl: "a.com" },
    ],
    "b.com*": [{ ...BASE, id: "x3", sourceUrl: "b.com*", isWildcard: true }],
    "c.com": "bad",
  };
  const compact = plain(pure.compactBucketData(data));
  assert.deepStrictEqual(compact["a.com"], [
    plain(pure.compactJumpmark(data["a.com"][0], "a.com")),
    plain(pure.compactJumpmark(data["a.com"][1], "a.com")),
  ]);
  assert.deepStrictEqual(compact["b.com*"], [
    plain(pure.compactJumpmark(data["b.com*"][0], "b.com*")),
  ]);
  assert.strictEqual(compact["c.com"], "bad");
  const expanded = plain(pure.expandBucketData(pure.compactBucketData(data)));
  assert.deepStrictEqual(expanded, plain(data));
  assert.strictEqual(pure.expandBucketData(data)["c.com"], "bad");
});

// ---- 読み込み ----

test("AC-9: reads fully compact store", async () => {
  const data = makeData();
  assert.deepStrictEqual(
    await read(compactItems(data)),
    await read(currentItems(data)),
  );
  assert.deepStrictEqual(await read(currentItems(data)), plain(data));
});

test("AC-10: reads compact store with continuation items", async () => {
  const data = makeBigData();
  const current = currentItems(data);
  const bigBucket = bucketOfUrl(BIG_URL);
  assert.ok(current[`jm:${bigBucket}`].n >= 2);
  const compact = compactItems(data);
  assert.ok(compact[`jm:${bigBucket}:1`].f === 1);
  assert.deepStrictEqual(await read(compact), await read(current));
});

test("AC-11: reads mixed current/compact buckets", async () => {
  const data = makeData();
  const mixed = compactItems(data, (bucket) => bucket % 2 === 0);
  const flags = Object.values(mixed).map((item) => item.f === 1);
  assert.ok(flags.includes(true) && flags.includes(false));
  assert.deepStrictEqual(await read(mixed), await read(currentItems(data)));
});

test("AC-12: unmarked head + compact continuation", async () => {
  const data = makeBigData();
  const bucket = bucketOfUrl(BIG_URL);
  const items = currentItems(data);
  const compactHead = items[`jm:${bucket}`];
  assert.ok(compactHead.n >= 2);
  const second = items[`jm:${bucket}:1`];
  // 先頭は今の形（f なし）。続き項目は詰めた形で、r が先頭と食い違う
  const extra = {
    [BIG_URL]: [
      ...second.d[BIG_URL],
      // 先頭項目と同じ id のエントリ（詰めた形）。重複は 1 件になる
      ...compactHead.d[BIG_URL].slice(0, 1),
    ],
  };
  for (const key of Object.keys(items)) {
    if (key.startsWith(`jm:${bucket}:`)) delete items[key];
  }
  items[`jm:${bucket}`] = { n: 2, r: "aaaaaaaa", d: compactHead.d };
  items[`jm:${bucket}:1`] = {
    f: 1,
    r: "bbbbbbbb",
    d: plain(pure.compactBucketData(extra)),
  };

  const result = (await read(items))[BIG_URL];
  const headIds = compactHead.d[BIG_URL].map((j) => j.id);
  const secondIds = second.d[BIG_URL].map((j) => j.id);
  assert.deepStrictEqual(
    result.map((j) => j.id).sort(),
    [...new Set([...headIds, ...secondIds])].sort(),
  );
  for (const jumpmark of result) {
    assert.strictEqual(typeof jumpmark.id, "string");
    for (const name of ["i", "t", "u", "f"]) {
      assert.ok(!(name in jumpmark), name);
    }
  }
});

test("AC-13: compact bucket entry is not re-imported from legacy", async () => {
  const data = makeData();
  const target = data[urls.even[1]][0];
  const items = {
    ...compactItems(data),
    jumpmarks: {
      [urls.even[1]]: [{ ...target, title: "legacy" }],
    },
  };
  const result = await read(items);
  const ids = Object.values(result)
    .flat()
    .map((j) => j.id);
  assert.strictEqual(ids.filter((id) => id === target.id).length, 1);
  assert.deepStrictEqual(result, await read(currentItems(data)));
});

test("AC-26: isCompactJumpmarkEntry", () => {
  const cases = [
    [{ i: "x1" }, true],
    [{ i: "x1", t: "T" }, true],
    [{ id: "x1", i: "y" }, false],
    [{ i: 1 }, false],
    [{ t: "T" }, false],
    [{ id: undefined, i: "x1" }, false],
    [["x"], false],
    ["str", false],
    [null, false],
  ];
  for (const [entry, expected] of cases) {
    assert.strictEqual(
      pure.isCompactJumpmarkEntry(entry),
      expected,
      JSON.stringify(entry),
    );
  }
});

// 印の無い項目の中に、詰めたエントリと今の形のエントリが混ざったストア
function unmarkedCompactItems(data, url) {
  const items = currentItems(data);
  const key = `jm:${bucketOfUrl(url)}`;
  const list = items[key].d[url];
  items[key].d[url] = list.map((entry, index) =>
    index < 2 ? plain(pure.compactJumpmark(entry, url)) : entry,
  );
  assert.ok(!("f" in items[key]));
  return { items, key };
}

test("AC-27: reads compact entries inside unmarked items", async () => {
  const data = makeData();
  const wildcard = urls.even[0];
  const { items } = unmarkedCompactItems(data, wildcard);
  const result = await read(items);
  assert.deepStrictEqual(result, await read(currentItems(data)));
  assert.strictEqual(result[wildcard][0].isWildcard, true);
  assert.ok(result[wildcard].some((j) => j.icon === "🔖"));
  assert.ok(result[wildcard].some((j) => j.icon === "🔗"));

  // 印の無い先頭項目と続き項目（n: 2、同じ r）の両方に詰めたエントリ
  const big = makeBigData();
  const bucket = bucketOfUrl(BIG_URL);
  const bigItems = currentItems(big);
  assert.ok(bigItems[`jm:${bucket}`].n >= 2);
  for (const [key, item] of Object.entries(bigItems)) {
    if (bucketOfKey(key) !== bucket) continue;
    item.d = plain(pure.compactBucketData(item.d));
  }
  assert.deepStrictEqual(await read(bigItems), await read(currentItems(big)));
});

test("AC-28: entry with id and extra i is kept as is", async () => {
  const entry = {
    id: "x1",
    title: "T",
    url: "https://t.com",
    icon: "🔗",
    sourceUrl: "a.com",
    created: ISO,
    i: "keep",
  };
  const result = await read({ "jm:7": { d: { "a.com": [entry] } } });
  assert.deepStrictEqual(result, { "a.com": [entry] });
});

// ---- 書き込み ----

test("AC-14: write of mixed store is a no-op", async () => {
  const data = makeData();
  const items = {
    ...compactItems(data, (bucket) => bucket % 2 === 0),
    ...META,
  };
  const { sandbox, state } = load(items);
  await sandbox.writeJumpmarksStore(await sandbox.readJumpmarksStore());
  assert.strictEqual(state.setCalls.length, 0);
  assert.strictEqual(state.removeCalls.length, 0);
});

test("AC-15: saveJumpmark elsewhere leaves compact bucket untouched", async () => {
  const data = makeData();
  const items = {
    ...compactItems(data, (bucket) => bucket % 2 === 0),
    ...META,
  };
  const used = new Set(allUrls.map(bucketOfUrl));
  let url;
  for (let n = 0; !url; n++) {
    if (!used.has(bucketOfUrl(`saved${n}.com`))) url = `saved${n}.com`;
  }
  const compactKeys = Object.keys(items).filter((key) => items[key].f === 1);
  assert.ok(compactKeys.length > 0);
  const before = plain(items);

  const { sandbox, state } = load(items);
  await sandbox.saveJumpmark({
    title: "new",
    url: "https://n.com",
    sourceUrl: url,
  });
  assert.strictEqual(state.setCalls.length, 1);
  for (const key of compactKeys) {
    assert.ok(!(key in state.setCalls[0]), key);
    assert.deepStrictEqual(state.items[key], before[key], key);
  }
});

test("AC-16: deleteJumpmark rewrites compact bucket in current format", async () => {
  const data = makeData();
  const items = {
    ...compactItems(data, (bucket) => bucket % 2 === 0),
    ...META,
  };
  const url = urls.even[1];
  const target = data[url][0];
  const { sandbox, state } = load(items);
  const before = plain(await sandbox.readJumpmarksStore());

  await sandbox.deleteJumpmark(target.id);

  const expected = plain(before);
  expected[url] = expected[url].filter((j) => j.id !== target.id);
  const headKey = `jm:${bucketOfUrl(url)}`;
  const written = state.setCalls.find((call) => headKey in call);
  assert.ok(written);
  assert.deepStrictEqual(written[headKey], currentItems(expected)[headKey]);
  assert.ok(!("f" in written[headKey]));
  assert.deepStrictEqual(plain(await sandbox.readJumpmarksStore()), expected);
});

test("AC-17: current-format store never gets compact writes", async () => {
  const data = makeData();
  const { sandbox, state } = load({ ...currentItems(data), ...META });
  const saved = await sandbox.saveJumpmark({
    title: "new",
    url: "https://y1.com",
    sourceUrl: "x1.com",
    createBidirectional: true,
  });
  await sandbox.updateJumpmark(saved.id, { title: "renamed" });
  await sandbox.deleteJumpmark(saved.id);
  assert.ok(state.setCalls.length >= 3);

  for (const call of state.setCalls) {
    for (const [key, value] of Object.entries(call)) {
      if (key === "jm:meta") {
        assert.deepStrictEqual(Object.keys(value).sort(), ["legacyIds", "v"]);
        assert.strictEqual(value.v, 2);
        continue;
      }
      assert.ok(!("f" in value), key);
      for (const list of Object.values(value.d)) {
        for (const jumpmark of list) {
          assert.strictEqual(typeof jumpmark.id, "string");
          assert.ok(!("i" in jumpmark));
        }
      }
    }
  }
});

test("AC-29: unmarked compact entries cause one rewrite in current format", async () => {
  const data = makeData();
  const url = urls.even[0];
  const { items, key } = unmarkedCompactItems(data, url);
  Object.assign(items, META);

  const { sandbox, state } = load(items);
  await sandbox.writeJumpmarksStore(await sandbox.readJumpmarksStore());

  const expected = pure.buildJumpmarksStorageItems(
    Object.fromEntries([[url, data[url]]]),
  );
  assert.strictEqual(state.setCalls.length, 1);
  assert.deepStrictEqual(
    Object.keys(state.setCalls[0]).sort(),
    Object.keys(plain(expected)).sort(),
  );
  assert.ok(key in state.setCalls[0]);
  const bucketItems = currentItems(data);
  assert.deepStrictEqual(state.setCalls[0][key], bucketItems[key]);
  for (const list of Object.values(state.setCalls[0][key].d)) {
    for (const jumpmark of list) {
      assert.strictEqual(typeof jumpmark.id, "string");
      assert.ok(!("i" in jumpmark));
    }
  }
  assert.ok(!("f" in state.setCalls[0][key]));
  assert.strictEqual(state.removeCalls.length, 0);

  // 2 回目は書かない
  await sandbox.writeJumpmarksStore(await sandbox.readJumpmarksStore());
  assert.strictEqual(state.setCalls.length, 1);
  assert.strictEqual(state.removeCalls.length, 0);

  // f: 1 のバケットだけの混在ストアでは書かない
  const marked = load({
    ...compactItems(data, (bucket) => bucket % 2 === 0),
    ...META,
  });
  await marked.sandbox.writeJumpmarksStore(
    await marked.sandbox.readJumpmarksStore(),
  );
  assert.strictEqual(marked.state.setCalls.length, 0);
});

// ---- ドキュメント ----

const readDoc = (name) => readSource(name);
const section = (text, start) => {
  const from = text.indexOf(start);
  assert.ok(from >= 0, `${start} not found`);
  const rest = text.slice(from + start.length);
  // 次の見出し（### 以上の階層。#### の小見出しは節に含める）まで
  const next = rest.search(/\n#{1,3} /);
  return next === -1 ? rest : rest.slice(0, next);
};

test('AC-22: docs mention "f": 1', () => {
  for (const name of ["README.md", "README.en.md", "CLAUDE.md"]) {
    assert.ok(
      readDoc(name)
        .split("\n")
        .some((line) => line.includes('"f": 1')),
      name,
    );
  }
});

test("AC-23: README data structure sections", () => {
  const ja = section(readDoc("README.md"), "### データ構造");
  const en = section(readDoc("README.en.md"), "### Data structure");
  for (const text of [ja, en]) {
    for (const key of ["i", "t", "u", "k", "c", "a", "x"]) {
      assert.ok(text.includes(`| \`${key}\``), `key ${key}`);
    }
    for (const word of ["sourceUrl", "isWildcard", "🔗", '"f": 1']) {
      assert.ok(text.includes(word), word);
    }
    for (const word of ["jm:<番号>", "jm:<番号>:<i>", "jm:meta", "jumpmarks"]) {
      if (text === ja) assert.ok(text.includes(word), word);
    }
  }
  assert.ok(/印の無い項目/.test(ja));
  assert.ok(/書き込みは今の形/.test(ja));
  assert.ok(/without the marker/.test(en));
  assert.ok(/writes the current format/.test(en));
  const rows = (text) => text.split("\n").filter((l) => l.startsWith("| `"));
  assert.strictEqual(rows(ja).length, rows(en).length);
});

test("AC-24: CHANGELOG mentions #37 within Unreleased", () => {
  const lines = readDoc("CHANGELOG.md").split("\n");
  const start = lines.findIndex((l) => l.startsWith("## [Unreleased]"));
  const end = lines.findIndex((l) => l.startsWith("## [2.4.2]"));
  const hits = lines
    .map((line, index) => [line, index])
    .filter(([line]) => line.includes("#37"));
  assert.ok(hits.length >= 1);
  for (const [, index] of hits) {
    assert.ok(index > start && index < end, `line ${index + 1}`);
  }
});

test("AC-25: CLAUDE.md Storage Schema", () => {
  const text = section(readDoc("CLAUDE.md"), "**Storage Schema**");
  for (const word of [
    '"f": 1',
    "`i`",
    "`x`",
    "no own `id`",
    "reads the compact form but never writes",
    "rewritten in the current format",
  ]) {
    assert.ok(text.includes(word), word);
  }
});
