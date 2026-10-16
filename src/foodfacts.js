// Поиск продукта по штрих-коду в Open Food Facts. Без DOM и window.

const FIELDS = "product_name,product_name_ru,nutriments,serving_quantity,product_quantity";
const KJ_PER_KCAL = 4.184;

// Общий разбор числа (его же использует ai.js): число или строка вида «12,5» / «1 046».
// Возвращает конечное число или null.
export function parseNumber(v) {
  let n = NaN;
  if (typeof v === "number") n = v;
  else if (typeof v === "string" && v.trim() !== "") n = Number(v.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Единое правило для масс порции/упаковки (portionGrams, packageGrams, servingGrams):
// ноль, отрицательное или нечисло означает «масса неизвестна» → null, а не ошибку.
export function parseMass(v) {
  const n = parseNumber(v);
  return n !== null && n > 0 ? n : null;
}

function text(v) {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// -> { name, per100: Macros, servingGrams|null, packageGrams|null } | null (не найден / нет данных).
// Сбой сети или сервера — исключение с kind = "network", чтобы не путать с «не найдено».
export async function lookupBarcode(code, fetchImpl) {
  const digits = String(code ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const doFetch = typeof fetchImpl === "function" ? fetchImpl : (...a) => globalThis.fetch(...a);
  const url = `https://world.openfoodfacts.org/api/v2/product/${digits}.json?fields=${FIELDS}`;

  let res;
  try {
    res = await doFetch(url);
  } catch (e) {
    throw Object.assign(new Error("Нет связи с Open Food Facts"), { kind: "network", cause: e });
  }
  if (res.status === 404) return null; // OFF отвечает 404 со status 0 на неизвестный код
  if (!res.ok) throw Object.assign(new Error("Open Food Facts не отвечает"), { kind: "network", status: res.status });

  let data;
  try {
    data = await res.json();
  } catch (e) {
    // битое тело (обрыв, HTML-заглушка) — сбой связи, а не «продукт не найден»
    throw Object.assign(new Error("Open Food Facts вернул нечитаемый ответ"), { kind: "network", cause: e });
  }
  if (!data || data.status === 0 || !data.product) return null;
  const p = data.product;
  const n = p.nutriments;
  if (!n || typeof n !== "object") return null;

  let kcal = parseNumber(n["energy-kcal_100g"]);
  if (kcal === null) {
    const kj = parseNumber(n.energy_100g);
    kcal = kj === null ? null : kj / KJ_PER_KCAL;
  }
  if (kcal === null) return null;

  return {
    name: text(p.product_name_ru) || text(p.product_name) || "Продукт " + digits,
    per100: {
      kcal,
      protein: parseNumber(n.proteins_100g) ?? 0,
      fat: parseNumber(n.fat_100g) ?? 0,
      carbs: parseNumber(n.carbohydrates_100g) ?? 0,
    },
    servingGrams: parseMass(p.serving_quantity),
    packageGrams: parseMass(p.product_quantity),
  };
}
