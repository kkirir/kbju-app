// Вся арифметика КБЖУ. Чистые функции: без DOM и window.

const KEYS = ["kcal", "protein", "fat", "carbs"];

/** Энергия: ккал = кДж / KJ_PER_KCAL. */
export const KJ_PER_KCAL = 4.184;

/**
 * Единый разбор числа на проект: число или строка вида «12,5» / «1 046».
 * Возвращает конечное число или null (пусто, мусор).
 */
export function parseNumber(v) {
  let n = NaN;
  if (typeof v === "number") n = v;
  else if (typeof v === "string" && v.trim() !== "") n = Number(v.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Масса порции/упаковки: ноль, отрицательное или нечисло → null («масса неизвестна»). */
export function parseMass(v) {
  const n = parseNumber(v);
  return n !== null && n > 0 ? n : null;
}

const num = (v) => parseNumber(v) ?? 0;

/** Значения на 100 г (мл) → на grams. */
export function scale(per100, grams) {
  const k = num(grams) / 100;
  const out = {};
  for (const key of KEYS) out[key] = num(per100?.[key]) * k;
  return out;
}

/** Сумма КБЖУ списка (записей или позиций). */
export function sumMacros(list) {
  const out = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  for (const item of list || []) for (const key of KEYS) out[key] += num(item?.[key]);
  return out;
}

const positive = parseMass;

/**
 * Сырой результат readLabel → значения в ккал на 100 г/мл.
 * Если указано только «на порцию» и масса порции неизвестна — per100: null, есть perPortion.
 */
export function normalizeLabel(label) {
  const per = {};
  for (const key of KEYS) per[key] = num(label?.per?.[key]);
  if (label?.energyUnit === "kJ") per.kcal = per.kcal / KJ_PER_KCAL;

  const portionGrams = positive(label?.portionGrams);
  const packageGrams = positive(label?.packageGrams);
  const unit = label?.basis === "100ml" ? "ml" : "g";
  const suggestions = [...new Set([portionGrams, packageGrams].filter((v) => v !== null))];

  if (label?.basis === "portion") {
    if (portionGrams) return { per100: toPer100(per, portionGrams), perPortion: per, unit, suggestions };
    return { per100: null, perPortion: per, unit, suggestions };
  }
  return { per100: per, perPortion: portionGrams ? scale(per, portionGrams) : null, unit, suggestions };
}

/** Значения на grams → на 100 г. При grams ≤ 0 — null. */
export function toPer100(macros, grams) {
  const g = positive(grams);
  if (!g) return null;
  return scale(macros, 10000 / g);
}

const GOAL_FACTOR = { lose: 0.85, keep: 1, gain: 1.1 };
const PROTEIN_PER_KG = { lose: 1.8, keep: 1.4, gain: 1.8 };
const FAT_PER_KG = 0.9;

/**
 * Дневная норма: Миффлин — Сан-Жеор × активность ± цель.
 * profile = { sex: "male"|"female", age, height (см), weight (кг), targetWeight? (кг), activity: 1.2…1.9, goal: "lose"|"keep"|"gain" }
 * Калории — от текущего веса (обмен зависит от него), белок и жиры — от целевого, если он задан.
 */
export function calcGoal(profile) {
  const w = num(profile?.weight), h = num(profile?.height), a = num(profile?.age);
  const bmr = 10 * w + 6.25 * h - 5 * a + (profile?.sex === "female" ? -161 : 5);
  const goal = GOAL_FACTOR[profile?.goal] ? profile.goal : "keep";
  const activity = num(profile?.activity) || 1.2;
  const kcal = Math.round((bmr * activity * GOAL_FACTOR[goal]) / 10) * 10;
  const macroWeight = positive(profile?.targetWeight) ?? w;
  const protein = Math.round(PROTEIN_PER_KG[goal] * macroWeight);
  const fat = Math.round(FAT_PER_KG * macroWeight);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, fat, carbs };
}

/** Приём пищи по часу (0–23): до 11 завтрак, 11–16 обед, 16–21 ужин, остальное перекус. */
export function mealByHour(hour) {
  const h = num(hour);
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

const round1 = (v) => Math.round(num(v) * 10 + Number.EPSILON) / 10;

/** Округление для записи и показа: ккал до целых, Б/Ж/У до 0.1 г. */
export function round(macros) {
  return {
    kcal: Math.round(num(macros?.kcal)),
    protein: round1(macros?.protein),
    fat: round1(macros?.fat),
    carbs: round1(macros?.carbs),
  };
}

/** Значения × k (например, на порцию × число порций). */
export function times(macros, k) {
  return scale(macros, num(k) * 100);
}
