// Ручной ввод: название, граммы, КБЖУ на 100 г или на всю порцию → openReview.

import { toPer100 } from "../nutrition.js";
import { h, numberField, textField, segmented, openSheet, toast } from "./dom.js";
import { openReview } from "./review.js";

/** ctx: { date, meal? } */
export function openManual(ctx = {}) {
  const v = { name: "", grams: null, basis: "100g", kcal: null, protein: null, fat: null, carbs: null };
  const basisHint = h("p.hint");
  const updateHint = () => {
    basisHint.textContent = v.basis === "100g"
      ? "Значения указаны на 100 г продукта."
      : "Значения указаны на всю порцию. Если вес порции не знаешь — оставь поле «Вес» пустым.";
  };
  updateHint();

  const body = h("div.form",
    textField("Название", "", { onInput: (x) => { v.name = x; }, placeholder: "Например, сырники" }),
    numberField("Вес", null, { onInput: (x) => { v.grams = x; }, suffix: "г", placeholder: "необязательно" }),
    h("div.field", h("span.field-label", "Значения"),
      segmented([{ id: "100g", label: "На 100 г" }, { id: "portion", label: "На порцию" }], v.basis, (b) => { v.basis = b; updateHint(); })),
    basisHint,
    h("div.macro-grid",
      numberField("Ккал", null, { onInput: (x) => { v.kcal = x; }, suffix: "ккал" }),
      numberField("Белки", null, { onInput: (x) => { v.protein = x; }, suffix: "г" }),
      numberField("Жиры", null, { onInput: (x) => { v.fat = x; }, suffix: "г" }),
      numberField("Углеводы", null, { onInput: (x) => { v.carbs = x; }, suffix: "г" }),
    ),
  );

  const next = h("button.btn.btn-primary", { type: "button" }, "Дальше");
  const sheet = openSheet({ title: "Ввести вручную", body, footer: [next] });

  next.addEventListener("click", () => {
    if (!v.name.trim()) return toast("Впиши название");
    if (v.kcal === null) return toast("Впиши калории");
    const macros = { kcal: v.kcal, protein: v.protein || 0, fat: v.fat || 0, carbs: v.carbs || 0 };
    const grams = v.grams > 0 ? v.grams : null;
    let product;
    if (v.basis === "100g") {
      product = { per100: macros, perPortion: null, defaultGrams: grams || 100 };
    } else if (grams) {
      product = { per100: toPer100(macros, grams), perPortion: macros, defaultGrams: grams };
    } else {
      product = { per100: null, perPortion: macros, defaultCount: 1 };
    }
    sheet.close();
    openReview({
      kind: "product",
      name: v.name.trim(),
      unit: "g",
      suggestions: grams ? [grams] : [],
      source: "manual",
      date: ctx.date,
      meal: ctx.meal,
      ...product,
    });
  });
}
