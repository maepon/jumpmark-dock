// メッセージを取得する。chrome.i18n が無い環境（Node のテスト sandbox）ではキーをそのまま返す
function t(key, substitutions) {
  if (typeof chrome !== "undefined" && chrome.i18n && chrome.i18n.getMessage) {
    const message = chrome.i18n.getMessage(key, substitutions);
    if (message) return message;
    // キー未定義・_locales の破損・default_locale の誤字などで空文字列が返ったケース。
    // 例外にはならず画面には生のキー名がそのまま出るだけなので、devtools から気付けるようにする
    console.warn(`i18n: メッセージが見つかりません（key="${key}"）`);
  }
  return key;
}

// 実際に適用されたロケールコードを返す
function getUiLocale() {
  if (typeof chrome !== "undefined" && chrome.i18n && chrome.i18n.getMessage) {
    return chrome.i18n.getMessage("localeCode") || "en";
  }
  return "en";
}

// URLまたはパターン文字列から各種構成要素を安全に解析する共通ヘルパー
function parseUrlPattern(urlLikeStr) {
  if (!urlLikeStr) {
    return {
      success: false,
      protocol: "",
      hostname: "",
      port: "",
      host: "",
      pathname: "",
      isWildcard: false,
      normalizedWithoutWildcard: "",
    };
  }

  const trimmed = urlLikeStr.trim();
  const isWildcard = trimmed.endsWith("*");
  let cleanUrl = isWildcard ? trimmed.slice(0, -1) : trimmed;

  // クエリとハッシュの除去
  if (cleanUrl.includes("?")) cleanUrl = cleanUrl.split("?")[0];
  if (cleanUrl.includes("#")) cleanUrl = cleanUrl.split("#")[0];

  // プロトコルの抽出
  let protocol = "";
  let urlToParse = cleanUrl;
  if (cleanUrl.includes("://")) {
    const parts = cleanUrl.split("://");
    protocol = parts[0].toLowerCase();
    urlToParse = cleanUrl;
  } else {
    // URL API用に一時補完
    urlToParse = "https://" + cleanUrl;
  }

  try {
    const urlObj = new URL(urlToParse);
    const hostname = urlObj.hostname.toLowerCase();
    const port = urlObj.port;
    let host = urlObj.host.toLowerCase();

    // www. の除去
    if (host.startsWith("www.")) {
      host = host.substring(4);
    }

    let pathname = urlObj.pathname;
    if (pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }

    const normalizedWithoutWildcard = host + pathname;

    return {
      success: true,
      protocol: cleanUrl.includes("://") ? protocol : "",
      hostname,
      port,
      host,
      pathname,
      isWildcard,
      normalizedWithoutWildcard,
    };
  } catch (error) {
    console.error("URL解析エラー:", error, urlLikeStr);
    return {
      success: false,
      protocol: "",
      hostname: "",
      port: "",
      host: "",
      pathname: "",
      isWildcard,
      normalizedWithoutWildcard: cleanUrl,
    };
  }
}

// URLを正規化（プロトコル、www、末尾スラッシュを削除）
function normalizeUrl(url) {
  const parsed = parseUrlPattern(url);
  if (!parsed.success) return url;
  return parsed.isWildcard
    ? parsed.normalizedWithoutWildcard + "*"
    : parsed.normalizedWithoutWildcard;
}

// 現在のURLがパターンに適合するかチェック
function isUrlMatch(currentUrl, pattern) {
  if (!pattern) return false;
  if (!pattern.endsWith("*")) {
    return currentUrl === pattern;
  }

  const basePattern = pattern.slice(0, -1);
  // 中間アスタリスクは単なる文字として前方一致判定される
  return currentUrl === basePattern || currentUrl.startsWith(basePattern + "/");
}

// プロトコルを保持・判定して完全なURL文字列を生成
function formatUrlWithProtocol(
  sourceUrlNormalized,
  rawInputUrl = "",
  oldPartnerUrl = "",
) {
  if (!sourceUrlNormalized) return "";
  if (sourceUrlNormalized.includes("://")) return sourceUrlNormalized;

  // 1. 明示的な http:// の検出（入力生URL または 既存パートナーURL）
  if (
    (rawInputUrl && rawInputUrl.startsWith("http://")) ||
    (oldPartnerUrl && oldPartnerUrl.startsWith("http://"))
  ) {
    return "http://" + sourceUrlNormalized;
  }

  // 2. 明示的な https:// の検出
  if (
    (rawInputUrl && rawInputUrl.startsWith("https://")) ||
    (oldPartnerUrl && oldPartnerUrl.startsWith("https://"))
  ) {
    return "https://" + sourceUrlNormalized;
  }

  // 3. URL API のみを使用して hostname を安全に判定（split(':') は使用しない）
  const parsed = parseUrlPattern(sourceUrlNormalized);
  const hostname = parsed.hostname;

  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.startsWith("[fe80:") ||
    hostname.startsWith("[fc") ||
    hostname.startsWith("[fd") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".localhost");

  if (isLocalHost) {
    return "http://" + sourceUrlNormalized; // ローカル環境は既定 http://
  }

  // 4. 一般的なドメインの既定フォールバックは https://
  return "https://" + sourceUrlNormalized;
}

// ソースURLパターンのバリデーション
function validateSourceUrlPattern(pattern) {
  if (!pattern || !pattern.trim()) {
    return { valid: false, message: t("errorPatternRequired") };
  }

  const parsed = parseUrlPattern(pattern);
  if (!parsed.host || parsed.host.length < 3) {
    return { valid: false, message: t("errorHostTooShort") };
  }

  return { valid: true };
}

// 一意なIDを生成
function generateUniqueId() {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${randomStr}`;
}

// URLの検証
function validateUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
}

// 日付をフォーマット
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString(getUiLocale(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// HTMLエスケープ
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// 指定URLのJumpmarksを取得
async function getJumpmarksForUrl(url) {
  try {
    const allJumpmarks = await readJumpmarksStore();

    let matchedJumpmarks = [];
    for (const pattern in allJumpmarks) {
      if (isUrlMatch(url, pattern)) {
        allJumpmarks[pattern].forEach((jm) => {
          matchedJumpmarks.push({
            ...jm,
            sourceUrl: pattern,
          });
        });
      }
    }
    return matchedJumpmarks;
  } catch (error) {
    console.error("Jumpmarks取得エラー:", error);
    return [];
  }
}

// 全てのJumpmarksを取得
async function getAllJumpmarks() {
  try {
    const allJumpmarks = await readJumpmarksStore();

    // URLごとのJumpmarksを平坦化
    const jumpmarksList = [];
    Object.entries(allJumpmarks).forEach(([sourceUrl, jumpmarks]) => {
      jumpmarks.forEach((jumpmark) => {
        jumpmarksList.push({
          ...jumpmark,
          sourceUrl: sourceUrl,
        });
      });
    });

    return jumpmarksList;
  } catch (error) {
    console.error("全Jumpmarks取得エラー:", error);
    return [];
  }
}

// Jumpmarkを保存
async function saveJumpmark(jumpmarkData) {
  try {
    const jumpmarks = await readJumpmarksStore();

    const sourceUrl = normalizeUrl(jumpmarkData.sourceUrl);
    const targetUrl = jumpmarkData.url;
    const isWildcard = sourceUrl.endsWith("*");

    // 新しいJumpmarkを作成
    const newJumpmark = {
      id: generateUniqueId(),
      title: jumpmarkData.title,
      url: targetUrl,
      icon: jumpmarkData.icon || "🔗",
      sourceUrl: sourceUrl,
      created: new Date().toISOString(),
    };
    if (isWildcard) {
      newJumpmark.isWildcard = true;
    }

    // ソースURLのJumpmarksに追加
    if (!jumpmarks[sourceUrl]) {
      jumpmarks[sourceUrl] = [];
    }
    jumpmarks[sourceUrl].push(newJumpmark);

    // 双方向リンクの場合、逆方向も作成（ワイルドカードでない場合のみ）
    if (jumpmarkData.createBidirectional && !isWildcard) {
      const normalizedTargetUrl = normalizeUrl(targetUrl);
      if (!jumpmarks[normalizedTargetUrl]) {
        jumpmarks[normalizedTargetUrl] = [];
      }

      // 逆方向のJumpmarkを作成
      const reverseUrl = formatUrlWithProtocol(
        sourceUrl,
        jumpmarkData.sourceUrl,
      );
      const reverseJumpmark = {
        id: generateUniqueId(),
        title: jumpmarkData.reverseTitle || `← ${jumpmarkData.title}`,
        url: reverseUrl,
        icon: jumpmarkData.icon || "🔗",
        sourceUrl: normalizedTargetUrl,
        created: new Date().toISOString(),
      };

      jumpmarks[normalizedTargetUrl].push(reverseJumpmark);
    }

    await writeJumpmarksStore(jumpmarks);
    return newJumpmark;
  } catch (error) {
    console.error("Jumpmark保存エラー:", error);
    throw error;
  }
}

// Jumpmarkを更新（キー移動および逆方向エントリの整合性を維持）
async function updateJumpmark(jumpmarkId, updateData) {
  try {
    const jumpmarks = await readJumpmarksStore();

    let foundJumpmark = null;
    let oldSourceUrl = null;

    // 編集対象のJumpmarkを検索
    for (const [url, jumpmarkList] of Object.entries(jumpmarks)) {
      const index = jumpmarkList.findIndex((j) => j.id === jumpmarkId);
      if (index !== -1) {
        foundJumpmark = jumpmarkList[index];
        oldSourceUrl = url;
        break;
      }
    }

    if (!foundJumpmark) {
      throw createJumpmarkNotFoundError();
    }

    // 更新前の状態に基づく古い双方向パートナーを検索
    let oldPartner = null;
    let oldPartnerSourceUrl = null;
    for (const [url, jumpmarkList] of Object.entries(jumpmarks)) {
      const partnerIndex = jumpmarkList.findIndex((j) =>
        isBidirectionalPair(foundJumpmark, j),
      );
      if (partnerIndex !== -1) {
        oldPartner = jumpmarkList[partnerIndex];
        oldPartnerSourceUrl = url;
        break;
      }
    }

    // 古いキーから編集対象を削除
    const oldList = jumpmarks[oldSourceUrl];
    if (oldList) {
      const idx = oldList.findIndex((j) => j.id === jumpmarkId);
      if (idx !== -1) oldList.splice(idx, 1);
      if (oldList.length === 0) delete jumpmarks[oldSourceUrl];
    }

    // 古いパートナーが存在した場合は一度ストレージから削除（後で必要に応じて再作成/更新）
    if (oldPartner && oldPartnerSourceUrl) {
      const partnerList = jumpmarks[oldPartnerSourceUrl];
      if (partnerList) {
        const pIdx = partnerList.findIndex((j) => j.id === oldPartner.id);
        if (pIdx !== -1) partnerList.splice(pIdx, 1);
        if (partnerList.length === 0) delete jumpmarks[oldPartnerSourceUrl];
      }
    }

    // 新しいsourceUrlとtargetUrlを決定
    const newSourceUrl = updateData.sourceUrl
      ? normalizeUrl(updateData.sourceUrl)
      : oldSourceUrl;
    const newTargetUrl = updateData.url || foundJumpmark.url;
    const isWildcard = newSourceUrl.endsWith("*");

    // 双方向リンクを作成・更新するか判定
    const createBidirectional =
      !isWildcard &&
      (updateData.createBidirectional !== undefined
        ? !!updateData.createBidirectional
        : updateData.createReverse !== undefined
          ? !!updateData.createReverse
          : !!oldPartner);

    // 更新データを適用
    const updatedJumpmark = {
      ...foundJumpmark,
      ...updateData,
      sourceUrl: newSourceUrl,
      url: newTargetUrl,
    };

    // 一時フラグを除去
    delete updatedJumpmark.createBidirectional;
    delete updatedJumpmark.createReverse;

    if (isWildcard) {
      updatedJumpmark.isWildcard = true;
    } else {
      delete updatedJumpmark.isWildcard;
    }

    // 新しいキーのリストに追加
    if (!jumpmarks[newSourceUrl]) {
      jumpmarks[newSourceUrl] = [];
    }
    jumpmarks[newSourceUrl].push(updatedJumpmark);

    // 双方向リンクの場合、逆方向エントリを作成・更新
    if (createBidirectional) {
      const normalizedTargetUrl = normalizeUrl(newTargetUrl);
      if (!jumpmarks[normalizedTargetUrl]) {
        jumpmarks[normalizedTargetUrl] = [];
      }

      const rawInputSource = updateData.sourceUrl || "";
      const oldPartnerUrl = oldPartner ? oldPartner.url : "";
      const reverseUrl = formatUrlWithProtocol(
        newSourceUrl,
        rawInputSource,
        oldPartnerUrl,
      );
      const reverseJumpmark = {
        id: oldPartner ? oldPartner.id : generateUniqueId(),
        title:
          updateData.reverseTitle ||
          (oldPartner ? oldPartner.title : `← ${updatedJumpmark.title}`),
        url: reverseUrl,
        icon: updatedJumpmark.icon || "🔗",
        sourceUrl: normalizedTargetUrl,
        created: oldPartner ? oldPartner.created : new Date().toISOString(),
      };

      jumpmarks[normalizedTargetUrl].push(reverseJumpmark);
    }

    await writeJumpmarksStore(jumpmarks);
    return true;
  } catch (error) {
    console.error("Jumpmark更新エラー:", error);
    throw error;
  }
}

// Jumpmarkを削除（単体）
async function deleteJumpmark(jumpmarkId) {
  try {
    const jumpmarks = await readJumpmarksStore();

    let found = false;

    // Jumpmarkを検索して削除
    Object.entries(jumpmarks).forEach(([url, jumpmarkList]) => {
      const index = jumpmarkList.findIndex((j) => j.id === jumpmarkId);
      if (index !== -1) {
        jumpmarkList.splice(index, 1);
        found = true;

        // 空になったURLエントリを削除
        if (jumpmarkList.length === 0) {
          delete jumpmarks[url];
        }
      }
    });

    if (!found) {
      throw createJumpmarkNotFoundError();
    }

    await writeJumpmarksStore(jumpmarks, { checkQuota: false });
    return true;
  } catch (error) {
    console.error("Jumpmark削除エラー:", error);
    throw error;
  }
}

// 双方向ペアを削除
async function deleteBidirectionalPair(jumpmarkId, partnerId) {
  try {
    const jumpmarks = await readJumpmarksStore();

    let deletedCount = 0;

    // 両方のJumpmarkを削除
    [jumpmarkId, partnerId].forEach((id) => {
      Object.entries(jumpmarks).forEach(([url, jumpmarkList]) => {
        const index = jumpmarkList.findIndex((j) => j.id === id);
        if (index !== -1) {
          jumpmarkList.splice(index, 1);
          deletedCount++;

          // 空になったURLエントリを削除
          if (jumpmarkList.length === 0) {
            delete jumpmarks[url];
          }
        }
      });
    });

    await writeJumpmarksStore(jumpmarks, { checkQuota: false });
    return deletedCount;
  } catch (error) {
    console.error("双方向ペア削除エラー:", error);
    throw error;
  }
}

// 複数のJumpmarksを削除
async function deleteJumpmarks(jumpmarkIds) {
  try {
    const jumpmarks = await readJumpmarksStore();

    let deletedCount = 0;

    // 各Jumpmarkを削除
    jumpmarkIds.forEach((jumpmarkId) => {
      Object.entries(jumpmarks).forEach(([url, jumpmarkList]) => {
        const index = jumpmarkList.findIndex((j) => j.id === jumpmarkId);
        if (index !== -1) {
          jumpmarkList.splice(index, 1);
          deletedCount++;

          // 空になったURLエントリを削除
          if (jumpmarkList.length === 0) {
            delete jumpmarks[url];
          }
        }
      });
    });

    await writeJumpmarksStore(jumpmarks, { checkQuota: false });
    return deletedCount;
  } catch (error) {
    console.error("複数Jumpmark削除エラー:", error);
    throw error;
  }
}

// ストレージ変更通知で判定に使う領域名
const JUMPMARKS_STORAGE_AREA_NAME = "sync";

// chrome.storage.sync の上限（バイト）。全体 / 1項目 / 項目数
const SYNC_QUOTA_BYTES = 102400;
const SYNC_QUOTA_BYTES_PER_ITEM = 8192;
const SYNC_MAX_ITEMS = 512;

// 作成元 URL のハッシュで振り分けるバケット数
const JUMPMARKS_BUCKET_COUNT = 64;

// 変更通知をまとめる待ち時間（ミリ秒）
const JUMPMARKS_CHANGE_NOTIFY_DELAY_MS = 100;

// メタ項目のキーと、v2.3.0 以前の 1 項目形式のキー
const JUMPMARKS_META_KEY = "jm:meta";
const LEGACY_JUMPMARKS_KEY = "jumpmarks";

// Jumpmarks を保存するストレージ領域（呼ばれるたびに参照する）
function getJumpmarksStorageArea() {
  return chrome.storage.sync;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fnv1a32(str) {
  const bytes = new TextEncoder().encode(str);
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

// FNV-1a 32bit を 8 桁の小文字 16 進で返す
function hashStringFnv1a(str) {
  return fnv1a32(str).toString(16).padStart(8, "0");
}

// 作成元 URL が入るバケット番号（0〜63）
function getJumpmarksBucketIndex(sourceUrl) {
  return fnv1a32(sourceUrl) % JUMPMARKS_BUCKET_COUNT;
}

// キーの UTF-8 バイト数 + JSON.stringify(値) の UTF-8 バイト数
function calculateStorageItemBytes(key, value) {
  const encoder = new TextEncoder();
  return (
    encoder.encode(key).length + encoder.encode(JSON.stringify(value)).length
  );
}

function calculateStorageItemsBytes(items) {
  return Object.entries(items).reduce(
    (sum, [key, value]) => sum + calculateStorageItemBytes(key, value),
    0,
  );
}

// 空の配列の作成元 URL を除き、キーの昇順に並べた JSON 文字列（バケットの内容の比較・rev 用）
function canonicalizeBucketData(data) {
  const ordered = {};
  for (const url of Object.keys(data).sort()) {
    if (Array.isArray(data[url]) && data[url].length > 0) {
      ordered[url] = data[url];
    }
  }
  return JSON.stringify(ordered);
}

function getBucketHeadKey(bucket) {
  return `jm:${bucket}`;
}

function getBucketContinuationKey(bucket, index) {
  return `jm:${bucket}:${index}`;
}

// jumpmarks を作成元 URL のバケットに振り分ける（バケット番号の昇順、中は作成元 URL の昇順）
function groupJumpmarksByBucket(jumpmarks) {
  const source = isPlainObject(jumpmarks) ? jumpmarks : {};
  const groups = new Map();
  for (const url of Object.keys(source).sort()) {
    if (!Array.isArray(source[url]) || source[url].length === 0) continue;
    const bucket = getJumpmarksBucketIndex(url);
    if (!groups.has(bucket)) groups.set(bucket, {});
    groups.get(bucket)[url] = source[url];
  }
  return new Map([...groups].sort((a, b) => a[0] - b[0]));
}

// 1 バケット分のデータを、1 項目 8,192 バイト以下の項目群（先頭項目 + 続き項目）にする
function buildBucketItems(bucket, data) {
  const headKey = getBucketHeadKey(bucket);
  const single = { d: data };
  if (calculateStorageItemBytes(headKey, single) <= SYNC_QUOTA_BYTES_PER_ITEM) {
    return { [headKey]: single };
  }

  // n と r は詰め終わるまで決まらないので、最大幅の仮値で大きさを見積もる
  const wrap = (index, d) =>
    index === 0 ? { n: 999, r: "ffffffff", d } : { r: "ffffffff", d };
  const keyOf = (index) =>
    index === 0 ? headKey : getBucketContinuationKey(bucket, index);

  const chunks = [{}];
  for (const url of Object.keys(data)) {
    for (const jumpmark of data[url]) {
      const index = chunks.length - 1;
      const current = chunks[index];
      const candidate = {
        ...current,
        [url]: [...(current[url] ?? []), jumpmark],
      };
      const fits =
        calculateStorageItemBytes(keyOf(index), wrap(index, candidate)) <=
        SYNC_QUOTA_BYTES_PER_ITEM;
      if (fits || Object.keys(current).length === 0) {
        chunks[index] = candidate;
      } else {
        chunks.push({ [url]: [jumpmark] });
      }
    }
  }

  if (chunks.length === 1) {
    return { [headKey]: { d: chunks[0] } };
  }
  const rev = hashStringFnv1a(canonicalizeBucketData(data));
  const items = {};
  chunks.forEach((d, index) => {
    items[keyOf(index)] =
      index === 0 ? { n: chunks.length, r: rev, d } : { r: rev, d };
  });
  return items;
}

// jumpmarks（{ 作成元URL: [Jumpmark, ...] }）を保存用の項目群（キー → 値）にする。純粋・決定的
function buildJumpmarksStorageItems(jumpmarks) {
  const items = {};
  for (const [bucket, data] of groupJumpmarksByBucket(jumpmarks)) {
    Object.assign(items, buildBucketItems(bucket, data));
  }
  return items;
}

// バケットの項目のキーなら { bucket, index }（先頭項目は index 0）、それ以外は null
function parseJumpmarksBucketKey(key) {
  const match = /^jm:(\d+)(?::(\d+))?$/.exec(key);
  if (!match) return null;
  const bucket = Number(match[1]);
  if (bucket >= JUMPMARKS_BUCKET_COUNT) return null;
  if (match[2] === undefined) return { bucket, index: 0 };
  const index = Number(match[2]);
  return index >= 1 ? { bucket, index } : null;
}

// 1 バケットの項目から内容を読み取る。続き項目が欠けている・食い違うときは、ある分を連結して重複を除く
function readBucketData(head, continuations) {
  const headItem = isPlainObject(head) ? head : null;
  const n =
    headItem && Number.isInteger(headItem.n) && headItem.n >= 1
      ? headItem.n
      : 1;

  let consistent = headItem !== null;
  for (let i = 1; consistent && i < n; i++) {
    const item = continuations.get(i);
    consistent = isPlainObject(item) && item.r === headItem.r;
  }

  let sources;
  if (consistent) {
    sources = [headItem];
    for (let i = 1; i < n; i++) sources.push(continuations.get(i));
  } else {
    sources = headItem ? [headItem] : [];
    const indexes = [...continuations.keys()].sort((a, b) => a - b);
    for (const index of indexes) sources.push(continuations.get(index));
  }

  const data = {};
  for (const item of sources) {
    if (!isPlainObject(item) || !isPlainObject(item.d)) continue;
    for (const [url, list] of Object.entries(item.d)) {
      if (!Array.isArray(list)) continue;
      if (!data[url]) data[url] = [];
      data[url].push(...list);
    }
  }
  if (consistent) return data;

  for (const url of Object.keys(data)) {
    const seen = new Set();
    data[url] = data[url].filter((jumpmark) => {
      const id = isPlainObject(jumpmark) ? jumpmark.id : undefined;
      const identity =
        typeof id === "string"
          ? `id:${id}`
          : `json:${JSON.stringify(jumpmark)}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  }
  return data;
}

// get(null) の結果から、バケットごとの今の内容と、今あるキーの一覧を集める（バケット番号の昇順）
function collectBucketsFromItems(items) {
  const groups = new Map();
  for (const key of Object.keys(items)) {
    const parsed = parseJumpmarksBucketKey(key);
    if (!parsed) continue;
    if (!groups.has(parsed.bucket)) {
      groups.set(parsed.bucket, {
        head: undefined,
        continuations: new Map(),
        keys: [],
      });
    }
    const group = groups.get(parsed.bucket);
    group.keys.push(key);
    if (parsed.index === 0) {
      group.head = items[key];
    } else {
      group.continuations.set(parsed.index, items[key]);
    }
  }

  const buckets = new Map();
  for (const bucket of [...groups.keys()].sort((a, b) => a - b)) {
    const { head, continuations, keys } = groups.get(bucket);
    buckets.set(bucket, { data: readBucketData(head, continuations), keys });
  }
  return buckets;
}

// jm:meta の読み取り。プレーンなオブジェクトでなければ「無い」、legacyIds は空でない文字列だけ使う
function readJumpmarksMeta(items) {
  const meta = items[JUMPMARKS_META_KEY];
  if (!isPlainObject(meta)) return { exists: false, legacyIds: [] };
  const ids = Array.isArray(meta.legacyIds)
    ? meta.legacyIds.filter((id) => typeof id === "string" && id !== "")
    : [];
  return { exists: true, legacyIds: [...new Set(ids)] };
}

// 旧形式（jumpmarks 1 項目）の Jumpmark のうち、まだ取り込んでいないものを merged の末尾に足す
function mergeLegacyJumpmarks(merged, items) {
  const legacy = items[LEGACY_JUMPMARKS_KEY];
  if (!isPlainObject(legacy)) return;

  const meta = readJumpmarksMeta(items);
  const imported = new Set(meta.legacyIds);
  const present = new Set();
  for (const list of Object.values(merged)) {
    for (const jumpmark of list) {
      if (isPlainObject(jumpmark) && typeof jumpmark.id === "string") {
        present.add(jumpmark.id);
      }
    }
  }

  for (const [url, list] of Object.entries(legacy)) {
    if (!Array.isArray(list)) continue;
    for (const jumpmark of list) {
      if (!isPlainObject(jumpmark)) continue;
      const id = jumpmark.id;
      if (typeof id === "string" && id !== "") {
        if (imported.has(id) || present.has(id)) continue;
        present.add(id);
      } else if (meta.exists) {
        continue;
      }
      if (!merged[url]) merged[url] = [];
      merged[url].push(jumpmark);
    }
  }
}

// jm:meta の legacyIds。今の値と旧形式の id の和集合（減らない）を昇順で返す
function computeLegacyIds(items) {
  const ids = new Set(readJumpmarksMeta(items).legacyIds);
  const legacy = items[LEGACY_JUMPMARKS_KEY];
  if (isPlainObject(legacy)) {
    for (const list of Object.values(legacy)) {
      if (!Array.isArray(list)) continue;
      for (const jumpmark of list) {
        if (
          isPlainObject(jumpmark) &&
          typeof jumpmark.id === "string" &&
          jumpmark.id !== ""
        ) {
          ids.add(jumpmark.id);
        }
      }
    }
  }
  return [...ids].sort();
}

// 保存済みの Jumpmarks を読み込む。失敗はそのまま投げる（ログは呼び出し元の catch で出す）
async function readJumpmarksStore() {
  const items = await getJumpmarksStorageArea().get(null);

  const merged = {};
  for (const { data } of collectBucketsFromItems(items).values()) {
    for (const [url, list] of Object.entries(data)) {
      if (!merged[url]) merged[url] = [];
      merged[url].push(...list);
    }
  }
  mergeLegacyJumpmarks(merged, items);

  const result = {};
  for (const [url, list] of Object.entries(merged)) {
    if (list.length > 0) result[url] = list;
  }
  return result;
}

// Jumpmarks を書き込む。失敗はそのまま投げる（ログは呼び出し元の catch で出す）。
// 内容が変わったバケットだけを set 1 回で書き、要らなくなった項目は set の後に remove 1 回で消す。
// 旧形式の "jumpmarks" 項目には触らない
async function writeJumpmarksStore(jumpmarks, { checkQuota = true } = {}) {
  const items = await getJumpmarksStorageArea().get(null);
  const current = collectBucketsFromItems(items);
  const next = groupJumpmarksByBucket(jumpmarks);

  const toSet = {};
  const toRemove = [];
  const buckets = [...new Set([...current.keys(), ...next.keys()])].sort(
    (a, b) => a - b,
  );
  for (const bucket of buckets) {
    const existing = current.get(bucket);
    const data = next.get(bucket) ?? {};
    if (
      canonicalizeBucketData(existing?.data ?? {}) ===
      canonicalizeBucketData(data)
    ) {
      continue;
    }

    const newItems =
      Object.keys(data).length > 0 ? buildBucketItems(bucket, data) : {};
    Object.assign(toSet, newItems);
    // 要らなくなった項目は、先に空の値にしてから消す（remove に失敗しても内容は食い違わない）
    for (const key of existing?.keys ?? []) {
      if (key in newItems) continue;
      toRemove.push(key);
      toSet[key] =
        parseJumpmarksBucketKey(key).index === 0 ? { d: {} } : { r: "", d: {} };
    }
  }

  const meta = { v: 2, legacyIds: computeLegacyIds(items) };
  if (JSON.stringify(meta) !== JSON.stringify(items[JUMPMARKS_META_KEY])) {
    toSet[JUMPMARKS_META_KEY] = meta;
  }

  if (checkQuota) {
    assertWithinStorageQuota({ ...items, ...toSet }, Object.keys(toSet));
  }
  if (Object.keys(toSet).length === 0) return;

  await getJumpmarksStorageArea().set(toSet);

  if (toRemove.length > 0) {
    try {
      await getJumpmarksStorageArea().remove(toRemove);
    } catch (error) {
      console.warn("不要な保存項目の削除に失敗しました:", error);
    }
  }
}

// Jumpmarks の変更を監視する（MV3 Service Worker のため同期的に登録する）。
// 1 回の保存で複数回・複数項目の変更通知が来ても、コールバックは 100 ミリ秒ごとに 1 回にまとめる
function onJumpmarksChanged(callback) {
  let scheduled = false;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== JUMPMARKS_STORAGE_AREA_NAME || scheduled) return;
    const relevant = Object.keys(changes).some(
      (key) => key === LEGACY_JUMPMARKS_KEY || key.startsWith("jm:"),
    );
    if (!relevant) return;

    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      try {
        Promise.resolve(callback()).catch((error) => {
          console.error("Jumpmarks変更通知のコールバックエラー:", error);
        });
      } catch (error) {
        console.error("Jumpmarks変更通知のコールバックエラー:", error);
      }
    }, JUMPMARKS_CHANGE_NOTIFY_DELAY_MS);
  });
}

function createJumpmarkNotFoundError() {
  const error = new Error(t("errorJumpmarkNotFound"));
  error.name = "JumpmarkNotFoundError";
  return error;
}

function isJumpmarkNotFoundError(error) {
  return (
    error !== null &&
    typeof error === "object" &&
    error.name === "JumpmarkNotFoundError"
  );
}

// 上限（storage.sync 全体）に対する使用率（%）。100 を超える場合は 100、丸めない
function calculateStorageUsagePercent(bytes) {
  return Math.min((bytes / SYNC_QUOTA_BYTES) * 100, 100);
}

function getStorageUsageLevel(percent) {
  if (percent >= 90) return "danger";
  if (percent >= 70) return "warning";
  return "normal";
}

function formatStorageSize(bytes) {
  return (bytes / 1024).toFixed(1) + "KB";
}

// 書き込み後の全項目 items が上限を超えるなら true。
// 1 項目の上限は perItemKeys の項目（省略時は全項目）について見る
function isStorageQuotaExceeded(items, perItemKeys = Object.keys(items)) {
  if (Object.keys(items).length > SYNC_MAX_ITEMS) return true;
  if (calculateStorageItemsBytes(items) > SYNC_QUOTA_BYTES) return true;
  return perItemKeys.some(
    (key) =>
      calculateStorageItemBytes(key, items[key]) > SYNC_QUOTA_BYTES_PER_ITEM,
  );
}

function createStorageQuotaError() {
  const error = new Error(t("errorStorageQuotaExceeded"));
  error.name = "StorageQuotaError";
  return error;
}

// 自前の容量不足エラー、または Chrome 側の QUOTA_BYTES / MAX_ITEMS エラーなら true
function isStorageQuotaError(error) {
  if (error === null || typeof error !== "object") return false;
  if (error.name === "StorageQuotaError") return true;
  return (
    typeof error.message === "string" &&
    (error.message.includes("QUOTA_BYTES") ||
      error.message.includes("MAX_ITEMS"))
  );
}

// 書き込み前に呼ぶ。書き込み後の全項目が上限を超えるなら容量不足エラーを投げる
function assertWithinStorageQuota(items, perItemKeys) {
  if (isStorageQuotaExceeded(items, perItemKeys)) {
    throw createStorageQuotaError();
  }
}

// storage.sync にある全項目（旧形式・jm:meta を含む）の大きさの合計（バイト）
async function readStorageUsageBytes() {
  const items = await getJumpmarksStorageArea().get(null);
  return calculateStorageItemsBytes(items);
}

// ストレージ統計を取得
async function getStorageStats() {
  try {
    const jumpmarks = await readJumpmarksStore();

    let totalJumpmarks = 0;
    let originalJumpmarks = 0;
    let bidirectionalJumpmarks = 0;
    let urlCount = 0;

    Object.entries(jumpmarks).forEach(([url, jumpmarkList]) => {
      if (jumpmarkList.length > 0) {
        urlCount++;
        totalJumpmarks += jumpmarkList.length;

        jumpmarkList.forEach((jumpmark) => {
          if (jumpmark.bidirectional) {
            bidirectionalJumpmarks++;
          } else {
            originalJumpmarks++;
          }
        });
      }
    });

    // ストレージ使用量を計算（storage.sync 全体の上限に対する UTF-8 バイト数）
    const bytesUsed = await readStorageUsageBytes();

    return {
      totalJumpmarks,
      originalJumpmarks,
      bidirectionalJumpmarks,
      urlCount,
      bytesUsed,
      quotaBytes: SYNC_QUOTA_BYTES,
      usagePercent: calculateStorageUsagePercent(bytesUsed),
    };
  } catch (error) {
    console.error("ストレージ統計取得エラー:", error);
    return {
      totalJumpmarks: 0,
      originalJumpmarks: 0,
      bidirectionalJumpmarks: 0,
      urlCount: 0,
      bytesUsed: 0,
      quotaBytes: SYNC_QUOTA_BYTES,
      usagePercent: 0,
    };
  }
}

// デバウンス関数
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// イベントエミッター
class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }

  off(event, callback) {
    if (this.events[event]) {
      this.events[event] = this.events[event].filter((cb) => cb !== callback);
    }
  }

  emit(event, data) {
    if (this.events[event]) {
      this.events[event].forEach((callback) => callback(data));
    }
  }
}

// グローバルイベントエミッター
const eventEmitter = new EventEmitter();

// 拡張機能のバージョンを取得
function getExtensionVersion() {
  return chrome.runtime.getManifest().version;
}

// 現在のタブ情報を取得
async function getCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab;
  } catch (error) {
    console.error("タブ情報取得エラー:", error);
    return null;
  }
}

// 双方向リンクのペア判定
function isBidirectionalPair(jumpmarkA, jumpmarkB) {
  if (!jumpmarkA || !jumpmarkB || jumpmarkA.id === jumpmarkB.id) {
    return false;
  }

  const urlA = normalizeUrl(jumpmarkA.url);
  const urlB = normalizeUrl(jumpmarkB.url);
  const sourceA = jumpmarkA.sourceUrl;
  const sourceB = jumpmarkB.sourceUrl;

  return urlA === sourceB && urlB === sourceA;
}

// タブ一覧から選択可能なタブを抽出して並べ替える（純粋関数）
function filterSelectableTabs(tabs, currentTab) {
  const list = Array.isArray(tabs) ? tabs : [];
  const currentIncognito = !!(currentTab && currentTab.incognito);

  const isHttpUrl = (url) => {
    if (typeof url !== "string") return false;
    try {
      const protocol = new URL(url).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  };

  return list
    .filter((tab) => {
      if (!tab) return false;
      if (currentTab && tab.id === currentTab.id) return false;
      if (!isHttpUrl(tab.url)) return false;
      if (!!tab.incognito !== currentIncognito) return false;
      return true;
    })
    .sort((a, b) => {
      if (currentTab) {
        const aCurrent = a.windowId === currentTab.windowId;
        const bCurrent = b.windowId === currentTab.windowId;
        if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
      }
      if (a.windowId !== b.windowId) return a.windowId - b.windowId;
      return (a.index || 0) - (b.index || 0);
    });
}

// 指定jumpmarkと対になる双方向リンクを検索
async function findBidirectionalPartner(targetJumpmark) {
  try {
    const allJumpmarks = await getAllJumpmarks();
    return allJumpmarks.find((jm) => isBidirectionalPair(targetJumpmark, jm));
  } catch (error) {
    console.error("双方向パートナー検索エラー:", error);
    return null;
  }
}

// URLに移動（同一URLのタブがあればフォーカス、なければ新タブ作成）
async function navigateToUrl(url) {
  try {
    // 全てのタブを取得
    const tabs = await chrome.tabs.query({});

    // 完全に同じURLのタブを探す
    const exactTab = tabs.find((tab) => tab.url === url);

    if (exactTab) {
      // 同じURLのタブがある場合：フォーカスのみ（リロードしない）
      await chrome.tabs.update(exactTab.id, { active: true });
      await chrome.windows.update(exactTab.windowId, { focused: true });
    } else {
      // 同じURLのタブがない場合：新しいタブを作成
      await chrome.tabs.create({ url: url });
    }

    // ポップアップを閉じる
    if (window.close) {
      window.close();
    }
  } catch (error) {
    console.error("URL移動エラー:", error);
  }
}
