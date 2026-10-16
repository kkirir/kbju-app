import { test } from "node:test";
import assert from "node:assert/strict";
import { scale, sumMacros, normalizeLabel, calcGoal, mealByHour, round, toPer100, times, parseNumber, parseMass } from "../src/nutrition.js";

const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test("scale: 150 г творога 5% (121 ккал, 17/5/1.8 на 100 г)", () => {
  const m = scale({ kcal: 121, protein: 17, fat: 5, carbs: 1.8 }, 150);
  close(m.kcal, 181.5); close(m.protein, 25.5); close(m.fat, 7.5); close(m.carbs, 2.7);
});

test("sumMacros: сумма записей дня, пустой список — нули", () => {
  const day = [
    { name: "Овсянка", kcal: 300, protein: 10, fat: 6, carbs: 50 },
    { name: "Яйца", kcal: 155, protein: 12.6, fat: 10.6, carbs: 1.1 },
  ];
  const s = sumMacros(day);
  close(s.kcal, 455); close(s.protein, 22.6); close(s.fat, 16.6); close(s.carbs, 51.1);
  assert.deepEqual(sumMacros([]), { kcal: 0, protein: 0, fat: 0, carbs: 0 });
});

test("normalizeLabel: на 100 г в кДж → ккал (1000 кДж = 239 ккал), подсказки — порция и упаковка", () => {
  const r = normalizeLabel({
    ok: true, name: "Мюсли", basis: "100g", energyUnit: "kJ",
    per: { kcal: 1000, protein: 9, fat: 7, carbs: 60 }, portionGrams: 40, packageGrams: 400,
  });
  assert.equal(r.unit, "g");
  close(r.per100.kcal, 239.0, 0.05);
  close(r.per100.protein, 9); close(r.per100.fat, 7); close(r.per100.carbs, 60);
  assert.deepEqual(r.suggestions, [40, 400]);
  // порция 40 г: 239.0 × 0.4 = 95.6 ккал; 9 × 0.4 = 3.6; 7 × 0.4 = 2.8; 60 × 0.4 = 24
  close(r.perPortion.kcal, 95.6, 0.05);
  close(r.perPortion.protein, 3.6); close(r.perPortion.fat, 2.8); close(r.perPortion.carbs, 24);
});

test("normalizeLabel: только на порцию 30 г (120 ккал, 3/4.5/18) → 400 ккал, 10/15/60 на 100 г", () => {
  const r = normalizeLabel({
    ok: true, name: "Печенье", basis: "portion", energyUnit: "kcal",
    per: { kcal: 120, protein: 3, fat: 4.5, carbs: 18 }, portionGrams: 30, packageGrams: null,
  });
  close(r.per100.kcal, 400); close(r.per100.protein, 10); close(r.per100.fat, 15); close(r.per100.carbs, 60);
  assert.deepEqual(r.suggestions, [30]);
  assert.equal(r.unit, "g");
});

test("normalizeLabel: на порцию без массы → per100 null, perPortion как на этикетке; кДж тоже переводятся", () => {
  const r = normalizeLabel({
    ok: true, name: "Батончик", basis: "portion", energyUnit: "kJ",
    per: { kcal: 836.8, protein: 5, fat: 8, carbs: 20 }, portionGrams: null, packageGrams: null,
  });
  assert.equal(r.per100, null);
  close(r.perPortion.kcal, 200); close(r.perPortion.protein, 5); close(r.perPortion.fat, 8); close(r.perPortion.carbs, 20);
  assert.deepEqual(r.suggestions, []);
});

test("normalizeLabel: на 100 мл → unit ml, значения без изменений", () => {
  const r = normalizeLabel({
    ok: true, name: "Молоко 2,5%", basis: "100ml", energyUnit: "kcal",
    per: { kcal: 52, protein: 2.8, fat: 2.5, carbs: 4.7 }, portionGrams: null, packageGrams: 930,
  });
  assert.equal(r.unit, "ml");
  assert.deepEqual(r.per100, { kcal: 52, protein: 2.8, fat: 2.5, carbs: 4.7 });
  assert.deepEqual(r.suggestions, [930]);
});

// Ручные расчёты по §4 спецификации.
test("calcGoal: мужчина 30 лет, 180 см, 80 кг, активность 1.55, сбросить", () => {
  // BMR = 10·80 + 6.25·180 − 5·30 + 5 = 1780; ×1.55 = 2759; ×0.85 = 2345.15 → 2350
  // Б = 1.8·80 = 144; Ж = 0.9·80 = 72; У = (2350 − 576 − 648) / 4 = 281.5 → 282
  const g = calcGoal({ sex: "male", age: 30, height: 180, weight: 80, activity: 1.55, goal: "lose" });
  assert.deepEqual(g, { kcal: 2350, protein: 144, fat: 72, carbs: 282 });
});

test("calcGoal: женщина 25 лет, 165 см, 60 кг, активность 1.375, держать", () => {
  // BMR = 600 + 1031.25 − 125 − 161 = 1345.25; ×1.375 = 1849.72 → 1850
  // Б = 1.4·60 = 84; Ж = 54; У = (1850 − 336 − 486) / 4 = 257
  const g = calcGoal({ sex: "female", age: 25, height: 165, weight: 60, activity: 1.375, goal: "keep" });
  assert.deepEqual(g, { kcal: 1850, protein: 84, fat: 54, carbs: 257 });
});

test("calcGoal: набрать +10 %; углеводы не уходят ниже нуля", () => {
  // мужчина 40, 175 см, 70 кг, 1.2: BMR = 700 + 1093.75 − 200 + 5 = 1598.75; ×1.2×1.1 = 2110.35 → 2110
  // Б = 126, Ж = 63, У = (2110 − 504 − 567) / 4 = 259.75 → 260
  assert.deepEqual(
    calcGoal({ sex: "male", age: 40, height: 175, weight: 70, activity: 1.2, goal: "gain" }),
    { kcal: 2110, protein: 126, fat: 63, carbs: 260 },
  );
  // женщина 80, 150 см, 150 кг, 1.2, сбросить: 1876.5 × 1.2 × 0.85 = 1914.03 → 1910; Б 270 (1080), Ж 135 (1215) > 1910
  const g = calcGoal({ sex: "female", age: 80, height: 150, weight: 150, activity: 1.2, goal: "lose" });
  assert.equal(g.kcal, 1910);
  assert.equal(g.carbs, 0);
});

test("mealByHour: до 11:00 завтрак, 11–16 обед, 16–21 ужин, остальное перекус", () => {
  const cases = { 7: "breakfast", 10: "breakfast", 11: "lunch", 15: "lunch", 16: "dinner", 20: "dinner", 21: "snack", 23: "snack" };
  for (const [hour, meal] of Object.entries(cases)) assert.equal(mealByHour(Number(hour)), meal, `час ${hour}`);
});

test("round: ккал до целых, граммы до десятых", () => {
  assert.deepEqual(round({ kcal: 181.5, protein: 25.55, fat: 7.449, carbs: 2.7000001 }), { kcal: 182, protein: 25.6, fat: 7.4, carbs: 2.7 });
});

test("toPer100: 30 г дают 120 ккал, 3/4.5/18 → на 100 г 400 ккал, 10/15/60; без массы — null", () => {
  const r = toPer100({ kcal: 120, protein: 3, fat: 4.5, carbs: 18 }, 30);
  close(r.kcal, 400); close(r.protein, 10); close(r.fat, 15); close(r.carbs, 60);
  assert.equal(toPer100({ kcal: 120, protein: 3, fat: 4.5, carbs: 18 }, 0), null);
});

test("times: 2.5 порции по 200 ккал, 5/8/20 → 500 ккал, 12.5/20/50", () => {
  const r = times({ kcal: 200, protein: 5, fat: 8, carbs: 20 }, 2.5);
  close(r.kcal, 500); close(r.protein, 12.5); close(r.fat, 20); close(r.carbs, 50);
});

test("parseNumber: «12,5» → 12.5, «1 046» → 1046 (и с неразрывным пробелом), мусор и пусто → null", () => {
  assert.equal(parseNumber("12,5"), 12.5);
  assert.equal(parseNumber("1 046"), 1046);
  assert.equal(parseNumber("1\u00a0046"), 1046);
  assert.equal(parseNumber(7), 7);
  assert.equal(parseNumber("abc"), null);
  assert.equal(parseNumber("12 г"), null);
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber(null), null);
  assert.equal(parseNumber({}), null);
  assert.equal(parseMass("0"), null);
  assert.equal(parseMass("250"), 250);
});
