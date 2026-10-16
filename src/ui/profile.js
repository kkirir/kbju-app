// Анкета (пол, возраст, рост, вес, активность, цель) и поля нормы — для первого запуска и настроек.

import { calcGoal } from "../nutrition.js";
import { h, numberField, segmented, fmt } from "./dom.js";

export const ACTIVITY = [
  { value: 1.2, label: "Минимальная — сидячая работа, без спорта" },
  { value: 1.375, label: "Лёгкая — тренировки 1–3 раза в неделю" },
  { value: 1.55, label: "Средняя — 3–5 тренировок в неделю" },
  { value: 1.725, label: "Высокая — 6–7 тренировок в неделю" },
  { value: 1.9, label: "Очень высокая — физическая работа и спорт" },
];

export const GOALS = [
  { id: "lose", label: "Сбросить" },
  { id: "keep", label: "Держать" },
  { id: "gain", label: "Набрать" },
];

export const DEFAULT_PROFILE = { sex: "male", age: null, height: null, weight: null, activity: 1.375, goal: "keep" };

export function profileComplete(p) {
  return !!p && p.age > 0 && p.height > 0 && p.weight > 0 && (p.sex === "male" || p.sex === "female");
}

/** Форма анкеты. onChange(profile) на каждое изменение. */
export function profileForm(initial, onChange) {
  const p = { ...DEFAULT_PROFILE, ...(initial || {}) };
  const emit = () => onChange?.({ ...p });

  const activity = h("select.input", { onchange: () => { p.activity = Number(activity.value); emit(); } },
    ACTIVITY.map((a) => h("option", { value: String(a.value), selected: a.value === Number(p.activity) }, a.label)));

  const el = h("div.form",
    h("div.field", h("span.field-label", "Пол"),
      segmented([{ id: "male", label: "Мужской" }, { id: "female", label: "Женский" }], p.sex, (v) => { p.sex = v; emit(); })),
    h("div.field-row3",
      numberField("Возраст", p.age, { suffix: "лет", onInput: (v) => { p.age = v; emit(); } }),
      numberField("Рост", p.height, { suffix: "см", onInput: (v) => { p.height = v; emit(); } }),
      numberField("Вес", p.weight, { suffix: "кг", onInput: (v) => { p.weight = v; emit(); } }),
    ),
    h("label.field", h("span.field-label", "Активность"), activity),
    h("div.field", h("span.field-label", "Цель"), segmented(GOALS, p.goal, (v) => { p.goal = v; emit(); })),
  );
  return { el, get: () => ({ ...p }) };
}

/** Четыре поля нормы. onEdit(goal) — когда пользователь меняет цифру руками. */
export function goalFields(goal, onEdit) {
  const g = { ...(goal || { kcal: 0, protein: 0, fat: 0, carbs: 0 }) };
  const fields = {
    kcal: numberField("Ккал", g.kcal, { suffix: "ккал", onInput: (v) => { g.kcal = v ?? 0; onEdit?.({ ...g }); } }),
    protein: numberField("Белки", g.protein, { suffix: "г", onInput: (v) => { g.protein = v ?? 0; onEdit?.({ ...g }); } }),
    fat: numberField("Жиры", g.fat, { suffix: "г", onInput: (v) => { g.fat = v ?? 0; onEdit?.({ ...g }); } }),
    carbs: numberField("Углеводы", g.carbs, { suffix: "г", onInput: (v) => { g.carbs = v ?? 0; onEdit?.({ ...g }); } }),
  };
  const el = h("div.macro-grid", Object.values(fields));
  return {
    el,
    get: () => ({ ...g }),
    set(next) {
      Object.assign(g, next);
      for (const [k, f] of Object.entries(fields)) f.input.value = fmt(g[k], 0);
    },
  };
}

export { calcGoal };
