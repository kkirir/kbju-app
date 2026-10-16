// IndexedDB: записи дневника, недавние продукты, настройки. Всё на устройстве.

import { DEFAULT_MODEL } from "./ai.js";

const DB_NAME = "kbju";
const DB_VERSION = 1;
const SETTINGS_ID = "main";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("entries")) {
        const entries = db.createObjectStore("entries", { keyPath: "id" });
        entries.createIndex("date", "date");
      }
      if (!db.objectStoreNames.contains("products")) {
        const products = db.createObjectStore("products", { keyPath: "key" });
        products.createIndex("lastUsed", "lastUsed");
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(storeNames, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    let failed = null;
    const fail = (err) => {
      if (failed) return;
      failed = err || new Error("Транзакция прервана");
      try { tx.abort(); } catch {}
      reject(failed);
    };
    tx.oncomplete = () => { if (!failed) resolve(result); };
    tx.onerror = () => fail(tx.error);
    tx.onabort = () => fail(tx.error);
    let ret;
    try {
      ret = fn(tx);
    } catch (err) {
      fail(err);
      return;
    }
    Promise.resolve(ret).then((r) => { result = r; }, fail);
  });
}

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function productKey(name) {
  return String(name || "").trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

// ---------- Записи ----------

/** Записи за день YYYY-MM-DD, по времени создания. */
export async function listEntries(date) {
  const list = await run(["entries"], "readonly", (tx) =>
    reqToPromise(tx.objectStore("entries").index("date").getAll(date)));
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

/** Создаёт или перезаписывает запись. Возвращает сохранённую запись (с id; unit по умолчанию "g"). */
export async function saveEntry(entry) {
  const e = { ...entry, unit: entry.unit === "ml" ? "ml" : "g", id: entry.id || newId(), createdAt: entry.createdAt || Date.now() };
  await run(["entries"], "readwrite", (tx) => reqToPromise(tx.objectStore("entries").put(e)));
  return e;
}

export async function deleteEntry(id) {
  await run(["entries"], "readwrite", (tx) => reqToPromise(tx.objectStore("entries").delete(id)));
}

// ---------- Недавние продукты ----------

/** Недавние, свежие сверху; query — подстрока названия без учёта регистра. */
export async function listProducts(query = "") {
  const all = await run(["products"], "readonly", (tx) => reqToPromise(tx.objectStore("products").getAll()));
  const q = productKey(query);
  return all
    .filter((p) => !q || p.key.includes(q))
    .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
}

/**
 * Кладёт продукт в «Недавние» (ключ — нормализованное имя).
 * p = { name, per100|null, perPortion|null, unit, suggestions, lastGrams|null, lastCount|null, source }
 */
export async function upsertProduct(p) {
  const key = productKey(p.name);
  if (!key) return null;
  const product = { ...p, key, name: String(p.name).trim(), lastUsed: Date.now() };
  await run(["products"], "readwrite", (tx) => reqToPromise(tx.objectStore("products").put(product)));
  return product;
}

// ---------- Настройки ----------

/**
 * settings = { apiKey, model, profile|null, goal: Macros|null, goalManual: boolean }
 */
export async function getSettings() {
  const row = await run(["settings"], "readonly", (tx) => reqToPromise(tx.objectStore("settings").get(SETTINGS_ID)));
  const { id, ...rest } = row || {};
  return { apiKey: "", model: DEFAULT_MODEL, profile: null, goal: null, goalManual: false, ...rest };
}

/** Сливает переданные поля с текущими настройками. */
export async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await run(["settings"], "readwrite", (tx) => reqToPromise(tx.objectStore("settings").put({ ...next, id: SETTINGS_ID })));
  return next;
}

// ---------- Экспорт / импорт ----------

/** Все данные одной JSON-строкой. Ключ API в файл не попадает. */
export async function exportAll() {
  const data = await run(["entries", "products", "settings"], "readonly", async (tx) => {
    const [entries, products, settings] = await Promise.all([
      reqToPromise(tx.objectStore("entries").getAll()),
      reqToPromise(tx.objectStore("products").getAll()),
      reqToPromise(tx.objectStore("settings").get(SETTINGS_ID)),
    ]);
    return { entries, products, settings };
  });
  const { id, apiKey, ...settings } = data.settings || {};
  return JSON.stringify({
    app: "kbju",
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: data.entries,
    products: data.products,
    settings,
  }, null, 2);
}

// ---------- Проверка файла импорта ----------

const MEAL_IDS = ["breakfast", "lunch", "dinner", "snack"];
const SOURCES = ["photo", "label", "barcode", "recent", "manual"];
const isNum = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isMacros = (m) => !!m && typeof m === "object" && ["kcal", "protein", "fat", "carbs"].every((k) => isNum(m[k]));
const isMacrosOrNull = (m) => m === null || m === undefined || isMacros(m);
const isText = (v) => typeof v === "string" && v.trim() !== "";

function entryProblem(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return "не объект";
  if (!isText(e.id)) return "нет id";
  if (typeof e.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return "неверная дата";
  if (!MEAL_IDS.includes(e.meal)) return "неизвестный приём пищи";
  if (!isText(e.name)) return "нет названия";
  if (!isMacros(e)) return "неверные ккал/Б/Ж/У";
  if (!(e.grams === null || e.grams === undefined || (isNum(e.grams) && e.grams > 0))) return "неверные граммы";
  if (!isMacrosOrNull(e.per100)) return "неверные значения на 100 г";
  if (e.portions !== undefined && !(e.portions && isNum(e.portions.count) && isMacros(e.portions.perPortion))) return "неверные порции";
  if (e.unit !== undefined && e.unit !== "g" && e.unit !== "ml") return "неверная единица";
  if (!SOURCES.includes(e.source)) return "неизвестный источник";
  if (!isNum(e.createdAt)) return "нет времени создания";
  return null;
}

function productProblem(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return "не объект";
  if (!isText(p.name)) return "нет названия";
  if (!isMacrosOrNull(p.per100) || !isMacrosOrNull(p.perPortion)) return "неверные КБЖУ";
  if (!p.per100 && !p.perPortion) return "нет КБЖУ";
  if (p.suggestions !== undefined && !(Array.isArray(p.suggestions) && p.suggestions.every(isNum))) return "неверные подсказки";
  return null;
}

function settingsProblem(st) {
  if (st === null || st === undefined) return null;
  if (typeof st !== "object" || Array.isArray(st)) return "не объект";
  if (st.goal !== undefined && !isMacrosOrNull(st.goal)) return "неверная норма";
  if (st.profile !== undefined && st.profile !== null && (typeof st.profile !== "object" || Array.isArray(st.profile))) return "неверный профиль";
  if (st.model !== undefined && typeof st.model !== "string") return "неверная модель";
  return null;
}

/**
 * Проверяет файл экспорта целиком. Ошибка → Error с понятным текстом; ничего не записывается.
 * Возвращает очищенные данные.
 */
function validateImport(json) {
  let data;
  try { data = typeof json === "string" ? JSON.parse(json) : json; }
  catch { throw new Error("Файл не читается как JSON"); }
  if (!data || typeof data !== "object" || data.app !== "kbju" || !Array.isArray(data.entries) || !Array.isArray(data.products)) {
    throw new Error("Это не файл экспорта КБЖУ");
  }
  const problems = [];
  const ids = new Set();
  data.entries.forEach((e, i) => {
    let why = entryProblem(e);
    if (!why && ids.has(e.id)) why = "повтор id";
    if (why) problems.push(`запись №${i + 1}: ${why}`);
    else ids.add(e.id);
  });
  const keys = new Set();
  data.products.forEach((p, i) => {
    let why = productProblem(p);
    if (!why && keys.has(productKey(p.name))) why = "повтор названия";
    if (why) problems.push(`продукт №${i + 1}: ${why}`);
    else keys.add(productKey(p.name));
  });
  const sWhy = settingsProblem(data.settings);
  if (sWhy) problems.push(`настройки: ${sWhy}`);
  if (problems.length) {
    const shown = problems.slice(0, 3).join("; ");
    const more = problems.length > 3 ? ` и ещё ${problems.length - 3}` : "";
    throw new Error(`Файл не загружен, данные не тронуты. Ошибок: ${problems.length} (${shown}${more})`);
  }
  const st = data.settings || {};
  const settings = {};
  for (const k of ["model", "profile", "goal", "goalManual"]) if (st[k] !== undefined) settings[k] = st[k];
  if (settings.goalManual !== undefined) settings.goalManual = !!settings.goalManual;
  return { entries: data.entries, products: data.products, settings };
}

/**
 * Полностью заменяет данные содержимым экспорта. Ключ API на устройстве сохраняется.
 * Сначала проверяется весь файл: при любой ошибке бросает Error и ничего не меняет.
 * Возвращает { entries, products } — сколько загружено.
 */
export async function importAll(json) {
  const data = validateImport(json);
  const current = await getSettings();
  await run(["entries", "products", "settings"], "readwrite", (tx) => {
    const entries = tx.objectStore("entries");
    const products = tx.objectStore("products");
    const settings = tx.objectStore("settings");
    entries.clear();
    products.clear();
    for (const e of data.entries) entries.put({ ...e, unit: e.unit === "ml" ? "ml" : "g" });
    for (const p of data.products) products.put({ ...p, key: productKey(p.name), name: p.name.trim() });
    settings.put({ ...current, ...data.settings, apiKey: current.apiKey, id: SETTINGS_ID });
  });
  return { entries: data.entries.length, products: data.products.length };
}
