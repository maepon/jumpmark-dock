const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const CJK_RE = /[　-〿぀-ヿ一-鿿＀-￯]/;

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), "utf8"));
}

function readSource(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

// source 中の `${calleeName}(` の各出現位置から、対応する閉じ括弧までを括弧の深さ
// (文字列/テンプレートリテラルの内部は無視) で追跡して切り出し、呼び出し引数の
// 生テキストを配列で返す。
function extractCallArguments(source, calleeName) {
  const marker = `${calleeName}(`;
  const results = [];
  let searchFrom = 0;

  while (true) {
    const idx = source.indexOf(marker, searchFrom);
    if (idx === -1) break;

    const start = idx + marker.length;
    let i = start;
    let depth = 1;
    let inTemplate = false;
    let inSingle = false;
    let inDouble = false;

    while (i < source.length && depth > 0) {
      const ch = source[i];
      const prevCh = source[i - 1];

      if (inTemplate) {
        if (ch === "`" && prevCh !== "\\") inTemplate = false;
      } else if (inSingle) {
        if (ch === "'" && prevCh !== "\\") inSingle = false;
      } else if (inDouble) {
        if (ch === '"' && prevCh !== "\\") inDouble = false;
      } else if (ch === "`") {
        inTemplate = true;
      } else if (ch === "'") {
        inSingle = true;
      } else if (ch === '"') {
        inDouble = true;
      } else if (ch === "(") {
        depth++;
      } else if (ch === ")") {
        depth--;
      }
      i++;
    }

    results.push(source.slice(start, i - 1));
    searchFrom = i;
  }

  return results;
}

// source 中の `.textContent =` / `.innerHTML =`（`+=` も対象。プロパティ名と `=` の間・
// `=` の後ろの空白や改行は許容。`==`/`===`/`!==` は対象外）の代入右辺を、
// バッククォート文字列の開閉を追跡しつつ、深さ0の `;` またはファイル末尾までを終端
// として切り出し、右辺の生テキストを配列で返す。
function extractAssignmentRhs(source, propertyNames) {
  const results = [];

  for (const prop of propertyNames) {
    const escapedProp = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const markerRe = new RegExp(`\\.${escapedProp}\\s*\\+?=(?![=>])`, "g");

    while (true) {
      const match = markerRe.exec(source);
      if (match === null) break;

      const start = match.index + match[0].length;
      let i = start;
      let depth = 0;
      let inTemplate = false;
      let inSingle = false;
      let inDouble = false;

      while (i < source.length) {
        const ch = source[i];
        const prevCh = source[i - 1];

        if (inTemplate) {
          if (ch === "`" && prevCh !== "\\") inTemplate = false;
        } else if (inSingle) {
          if (ch === "'" && prevCh !== "\\") inSingle = false;
        } else if (inDouble) {
          if (ch === '"' && prevCh !== "\\") inDouble = false;
        } else if (ch === "`") {
          inTemplate = true;
        } else if (ch === "'") {
          inSingle = true;
        } else if (ch === '"') {
          inDouble = true;
        } else if (ch === "(" || ch === "[" || ch === "{") {
          depth++;
        } else if (ch === ")" || ch === "]" || ch === "}") {
          depth--;
        } else if (ch === ";" && depth === 0) {
          break;
        }
        i++;
      }

      results.push(source.slice(start, i));
      markerRe.lastIndex = i + 1;
    }
  }

  return results;
}

// text 中に含まれる t(...) 呼び出しのうち、`t(` とメッセージキー（英数字と `_` のみの
// 第1引数の文字列リテラル）だけを取り除いたテキストを返す。第2引数以降（substitution）は
// 検査対象として残す。キーが英数字と `_` 以外を含む場合は何も除去しない。
function stripTranslatedCalls(text) {
  let result = "";
  let i = 0;

  while (i < text.length) {
    const prevCh = text[i - 1] || "";
    if (
      text[i] === "t" &&
      text[i + 1] === "(" &&
      !/[A-Za-z0-9_$]/.test(prevCh)
    ) {
      const keyMatch = /^\s*(["'])[A-Za-z0-9_]+\1/.exec(text.slice(i + 2));
      if (keyMatch) {
        i += 2 + keyMatch[0].length;
        continue;
      }
    }

    result += text[i];
    i++;
  }

  return result;
}

function hasUntranslatedJapanese(text) {
  return CJK_RE.test(stripTranslatedCalls(text));
}

const EXPECTED_KEYS = [
  // 4-1 共通
  "localeCode",
  "extDescription",
  "actionEdit",
  "actionDelete",
  "actionCancel",
  "actionSave",
  "actionOk",
  "loading",
  "labelTitle",
  "labelUrl",
  "labelIcon",
  "unitItems",
  "errorInvalidUrl",
  "wildcardHint",
  "wildcardNotice",
  "editJumpmarkTitle",
  // 4-2 popup
  "popupEmptyTitle",
  "popupEmptySubtitle",
  "popupAddButton",
  "popupBackButton",
  "popupFormTitleNew",
  "popupTitlePlaceholder",
  "popupIconLabel",
  "popupBidirectionalLabel",
  "popupAdvancedHeader",
  "popupSourcePatternLabel",
  "popupErrorTitleUrlRequired",
  "popupErrorSaveFailed",
  "popupErrorUpdateFailed",
  // 4-3 shared.js
  "errorPatternRequired",
  "errorHostTooShort",
  "errorJumpmarkNotFound",
  // 4-4 options.html
  "optionsPageTitle",
  "tabManage",
  "importExport",
  "manageHeading",
  "manageDescription",
  "storageSummary",
  "searchPlaceholder",
  "sortCreated",
  "sortTitle",
  "sortUrl",
  "filterAll",
  "filterSingle",
  "filterBidirectional",
  "filterWildcard",
  "bulkSelectAll",
  "bulkDelete",
  "bulkExport",
  "optionsEmptyTitle",
  "optionsEmptySubtitle",
  "colType",
  "colCreated",
  "colActions",
  "pagePrev",
  "pageNext",
  "ieDescription",
  "exportHeading",
  "exportDescription",
  "exportFormatHeading",
  "exportJsonDesc",
  "exportCsvDesc",
  "exportHtmlDesc",
  "exportRangeHeading",
  "exportRangeAll",
  "exportRangeSelected",
  "exportRangeFiltered",
  "exportTargetLabel",
  "importHeading",
  "importDescription",
  "dropPrimary",
  "dropSecondary",
  "selectFile",
  "importOptionsHeading",
  "importMergeLabel",
  "importMergeHelp",
  "importSkipDuplicatesLabel",
  "importSkipDuplicatesHelp",
  "importPreviewHeading",
  "previewTotalLabel",
  "previewNewLabel",
  "previewSkippedLabel",
  "importExecute",
  "statusProcessing",
  "statusReady",
  "labelTitleRequired",
  "editTitlePlaceholder",
  "labelUrlRequired",
  "normalizedPrefix",
  "editIconHelp",
  "editCreateReverseLabel",
  "editCreateReverseHelp",
  "editBidirectionalExists",
  "editSourceUrlLabel",
  "confirmHeading",
  "confirmDefaultMessage",
  // 4-5 options.js
  "errorInitFailed",
  "statusLoaded",
  "errorLoadFailed",
  "typeSingle",
  "typeBidirectional",
  "typeWildcard",
  "bulkDeleteCount",
  "bulkExportCount",
  "confirmBulkDeleteTitle",
  "confirmBulkDeleteMessage",
  "statusDeletedCount",
  "errorDeleteFailed",
  "statusExportedCount",
  "errorTitleRequired",
  "errorUrlRequired",
  "errorEditTargetNotFound",
  "errorSourceUrlRequired",
  "statusUpdated",
  "errorUpdateFailedDetail",
  "warnStorageAlmostFull",
  "bidiDeleteTitle",
  "bidiDeleteMessage",
  "bidiDeleteOnlyThis",
  "bidiDeleteBoth",
  "statusDeletedPair",
  "statusDeletedOne",
  "confirmDeleteTitle",
  "confirmDeleteMessage",
  "errorDeleteProcess",
  "statusExportPreparing",
  "statusExporting",
  "statusExportProcessing",
  "statusExportDone",
  "errorExport",
  "errorUnknownExportFormat",
  "errorSelectExportTargets",
  "errorNoExportData",
  "errorSelectJsonFile",
  "errorFileTooLarge",
  "statusReadingFile",
  "errorInvalidFileFormat",
  "errorFileProcessing",
  "errorFileRead",
  "statusImporting",
  "statusImportDone",
  "statusImportedCount",
  "statusImportSkippedSuffix",
  "errorNoImportFile",
  "errorImport",
  // 4-6 HTMLエクスポート
  "htmlExportTitle",
  "htmlExportDate",
  "htmlExportTotal",
  "htmlExportCreated",
  "htmlExportSource",
];

const en = readJson("_locales/en/messages.json");
const ja = readJson("_locales/ja/messages.json");

test("locale files exist and parse as valid JSON", () => {
  assert.strictEqual(typeof en, "object");
  assert.strictEqual(typeof ja, "object");
});

test("en and ja locales define the same key set", () => {
  assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(ja).sort());
});

test("every message entry has a non-empty message string", () => {
  const violations = [];
  for (const [locale, messages] of [
    ["en", en],
    ["ja", ja],
  ]) {
    for (const [key, entry] of Object.entries(messages)) {
      if (typeof entry.message !== "string" || entry.message.length === 0) {
        violations.push([locale, key]);
      }
    }
  }
  assert.deepStrictEqual(violations, []);
});

test("defined message keys match the instruction's key list exactly", () => {
  assert.deepStrictEqual(
    [...Object.keys(en)].sort(),
    [...EXPECTED_KEYS].sort(),
  );
  assert.deepStrictEqual(
    [...Object.keys(ja)].sort(),
    [...EXPECTED_KEYS].sort(),
  );
});

test("placeholder tokens match between locales for every shared key", () => {
  const mismatches = [];
  for (const key of Object.keys(en)) {
    const enTokens = new Set(en[key].message.match(/\$[1-9]/g) || []);
    const jaTokens = new Set(
      (ja[key] ? ja[key].message.match(/\$[1-9]/g) : []) || [],
    );
    if (
      enTokens.size !== jaTokens.size ||
      [...enTokens].some((tk) => !jaTokens.has(tk))
    ) {
      mismatches.push(key);
    }
  }
  assert.deepStrictEqual(mismatches, []);
});

test("en messages contain no CJK or full-width characters", () => {
  const combined = Object.values(en)
    .map((entry) => entry.message)
    .join("\n");
  assert.strictEqual(CJK_RE.test(combined), false);
});

test("every en message key is referenced somewhere in the extension source", () => {
  const sourceFiles = [
    "manifest.json",
    "popup.html",
    "options.html",
    "popup.js",
    "options.js",
    "shared.js",
    "i18n.js",
  ];
  const combined = sourceFiles.map((f) => readSource(f)).join("\n");

  const unreferenced = Object.keys(en).filter((key) => {
    return !(
      combined.includes(`__MSG_${key}__`) ||
      combined.includes(`"${key}"`) ||
      combined.includes(`'${key}'`)
    );
  });

  assert.deepStrictEqual(unreferenced, []);
});

test("manifest.json has expected default_locale, description, version, name and title", () => {
  const manifest = readJson("manifest.json");
  assert.strictEqual(manifest.default_locale, "en");
  assert.strictEqual(manifest.description, "__MSG_extDescription__");
  assert.strictEqual(manifest.version, "2.2.2");
  assert.strictEqual(manifest.name, "Jumpmark Dock");
  assert.strictEqual(manifest.action.default_title, "Jumpmark Dock");
});

test("manifest __MSG_ placeholders resolve to defined en keys", () => {
  const manifestText = readSource("manifest.json");
  const keys = [...manifestText.matchAll(/__MSG_(\w+)__/g)].map((m) => m[1]);
  assert.ok(keys.length >= 1);
  const missing = keys.filter((key) => !(key in en));
  assert.deepStrictEqual(missing, []);
});

test("data-i18n* attribute values reference defined en keys", () => {
  const files = ["popup.html", "options.html"];
  const keys = [];
  for (const file of files) {
    const text = readSource(file);
    for (const m of text.matchAll(
      /data-i18n(?:-placeholder|-title|-unit)?="([^"]+)"/g,
    )) {
      keys.push(m[1]);
    }
  }
  assert.ok(keys.length >= 1);
  const missing = keys.filter((key) => !(key in en));
  assert.deepStrictEqual(missing, []);
});

const SINK_CALLS = [
  "alert",
  "showStatusMessage",
  "showIEStatus",
  "showEditError",
  "new Error",
];
const SINK_PROPERTIES = ["textContent", "innerHTML"];

// 呼び出し引数と代入右辺の 2 段階判定を source に適用し、違反の説明文字列を配列で返す。
// label は違反メッセージの先頭に付ける（実ファイルではファイル名）。
function findUntranslatedJapanese(source, label) {
  const violations = [];

  for (const sink of SINK_CALLS) {
    for (const arg of extractCallArguments(source, sink)) {
      if (hasUntranslatedJapanese(arg)) {
        violations.push(`${label}: ${sink}(${arg})`);
      }
    }
  }

  for (const rhs of extractAssignmentRhs(source, SINK_PROPERTIES)) {
    if (hasUntranslatedJapanese(rhs)) {
      violations.push(`${label}: assignment = ${rhs}`);
    }
  }

  return violations;
}

test("UI sinks (.textContent=/+=, .innerHTML=/+=, alert/showStatusMessage/showIEStatus/showEditError/new Error) never receive untranslated Japanese text", () => {
  const files = ["popup.js", "options.js", "shared.js", "i18n.js"];
  const violations = [];

  for (const file of files) {
    violations.push(...findUntranslatedJapanese(readSource(file), file));
  }

  assert.deepStrictEqual(violations, []);
});

function detects(source) {
  return findUntranslatedJapanese(source, "synthetic").length > 0;
}

test("detects untranslated Japanese in assignments (newline/whitespace/+=)", () => {
  assert.strictEqual(
    detects('x.textContent =\n  "日本語";'),
    true,
    "AC-1: newline after =",
  );
  assert.strictEqual(
    detects("x.innerHTML =\n  `<p>日本語</p>`;"),
    true,
    "AC-2: template literal on next line",
  );
  assert.strictEqual(
    detects('x.textContent\n  = "日本語";'),
    true,
    "AC-3: newline before =",
  );
  assert.strictEqual(
    detects('x.textContent="日本語";'),
    true,
    "AC-4: no whitespace around =",
  );
  assert.strictEqual(
    detects('x.textContent += "日本語";'),
    true,
    "AC-5: textContent +=",
  );
  assert.strictEqual(
    detects('x.innerHTML +=\n  "<b>日本語</b>";'),
    true,
    "AC-5: innerHTML += with newline",
  );
});

test("does not treat comparisons as assignments", () => {
  assert.strictEqual(
    detects('if (x.textContent === "日本語") {}'),
    false,
    "AC-6: ===",
  );
  assert.strictEqual(
    detects('if (x.textContent == "日本語") {}'),
    false,
    "AC-6: ==",
  );
  assert.strictEqual(
    detects('if (x.innerHTML !== "日本語") {}'),
    false,
    "AC-6: !==",
  );
});

test("detects Japanese literals inside t() substitutions", () => {
  assert.strictEqual(
    detects('x.textContent = t("someKey", ["日本語"]);'),
    true,
    "AC-7: single-line substitution",
  );
  assert.strictEqual(
    detects('x.textContent =\n  t("someKey", [\n    "日本語",\n  ]);'),
    true,
    "AC-7: multi-line substitution",
  );
  assert.strictEqual(
    detects('showStatusMessage(t("someKey", [String(n), "日本語"]));'),
    true,
    "AC-7: showStatusMessage argument",
  );
  assert.strictEqual(
    detects('x.textContent = t("someKey", [t("otherKey", ["日本語"])]);'),
    true,
    "AC-7: nested t() substitution",
  );
});

test("does not flag properly translated t() usage", () => {
  assert.strictEqual(
    detects('x.textContent = t("someKey");'),
    false,
    "AC-8: plain key",
  );
  assert.strictEqual(
    detects("x.textContent = t('someKey');"),
    false,
    "AC-8: single-quoted key",
  );
  assert.strictEqual(
    detects('x.textContent = t("someKey", [String(count)]);'),
    false,
    "AC-8: substitution without literal",
  );
  assert.strictEqual(
    detects('x.textContent = t("someKey", [t("otherKey")]);'),
    false,
    "AC-8: nested t() without literal",
  );
  assert.strictEqual(
    detects('x.innerHTML = `<p>${t("someKey", [escapeHtml(title)])}</p>`;'),
    false,
    "AC-8: t() inside template literal",
  );
  assert.strictEqual(
    detects("el.textContent = t(el.dataset.i18n);"),
    false,
    "AC-8: non-literal key",
  );
  assert.strictEqual(
    detects(
      'showStatusMessage(t("statusLoaded", [String(allJumpmarks.length)]));',
    ),
    false,
    "AC-8: showStatusMessage with t()",
  );
});

test("detects Japanese message keys passed to t()", () => {
  assert.strictEqual(
    detects('x.textContent = t("日本語");'),
    true,
    "AC-9: Japanese key",
  );
});

test("HTML text nodes in popup.html/options.html contain no untranslated Japanese", () => {
  const violations = [];

  for (const file of ["popup.html", "options.html"]) {
    let text = readSource(file);
    text = text.replace(/<!--[\s\S]*?-->/g, "");
    text = text.replace(/<script[\s\S]*?<\/script>/g, "");
    text = text.replace(/<style[\s\S]*?<\/style>/g, "");

    for (const m of text.matchAll(/>([^<]+)</g)) {
      if (CJK_RE.test(m[1])) {
        violations.push(`${file}: ${m[1].trim()}`);
      }
    }
  }

  assert.deepStrictEqual(violations, []);
});

test("shared.js loads in a chrome/document-less sandbox and falls back safely", () => {
  const sharedSrc = readSource("shared.js");
  const sandbox = { console, URL };
  vm.createContext(sandbox);
  assert.doesNotThrow(() => vm.runInContext(sharedSrc, sandbox));
  assert.strictEqual(sandbox.getUiLocale(), "en");
  assert.strictEqual(sandbox.t("actionEdit"), "actionEdit");
});
