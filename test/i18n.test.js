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

// source 中の `.textContent =` / `.innerHTML =`（`===`/`!==` は対象外）の代入右辺を、
// バッククォート文字列の開閉を追跡しつつ、深さ0の `;` またはファイル末尾までを終端
// として切り出し、右辺の生テキストを配列で返す。
function extractAssignmentRhs(source, propertyNames) {
  const results = [];

  for (const prop of propertyNames) {
    const marker = `.${prop} = `;
    let searchFrom = 0;

    while (true) {
      const idx = source.indexOf(marker, searchFrom);
      if (idx === -1) break;

      const start = idx + marker.length;
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
      searchFrom = i + 1;
    }
  }

  return results;
}

// text 中に含まれる t(...) 呼び出し（extractCallArguments と同じ括弧深さ追跡）を
// 呼び出し全体ごと取り除いたテキストを返す。
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
      let depth = 1;
      let j = i + 2;
      let inTemplate = false;
      let inSingle = false;
      let inDouble = false;

      while (j < text.length && depth > 0) {
        const ch = text[j];
        const prevCh2 = text[j - 1];

        if (inTemplate) {
          if (ch === "`" && prevCh2 !== "\\") inTemplate = false;
        } else if (inSingle) {
          if (ch === "'" && prevCh2 !== "\\") inSingle = false;
        } else if (inDouble) {
          if (ch === '"' && prevCh2 !== "\\") inDouble = false;
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
        j++;
      }

      i = j;
      continue;
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

test("UI sinks (.textContent=/.innerHTML=/alert/showStatusMessage/showIEStatus/showEditError/new Error) never receive untranslated Japanese text", () => {
  const files = ["popup.js", "options.js", "shared.js", "i18n.js"];
  const violations = [];

  for (const file of files) {
    const source = readSource(file);

    for (const sink of [
      "alert",
      "showStatusMessage",
      "showIEStatus",
      "showEditError",
      "new Error",
    ]) {
      for (const arg of extractCallArguments(source, sink)) {
        if (hasUntranslatedJapanese(arg)) {
          violations.push(`${file}: ${sink}(${arg})`);
        }
      }
    }

    for (const rhs of extractAssignmentRhs(source, [
      "textContent",
      "innerHTML",
    ])) {
      if (hasUntranslatedJapanese(rhs)) {
        violations.push(`${file}: assignment = ${rhs}`);
      }
    }
  }

  assert.deepStrictEqual(violations, []);
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
