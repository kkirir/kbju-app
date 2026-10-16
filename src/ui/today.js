// Экран «Сегодня»: кольцо «осталось ккал», полосы Б/Ж/У, 4 приёма пищи, листание дней.

import { sumMacros } from "../nutrition.js";
import { listEntries, getSettings } from "../store.js";
import { h, clear, fmt, MEALS } from "./dom.js";
import { getCurrentDate, setCurrentDate, addDays, dayLabel, toDateStr } from "./state.js";
import { openEntryEditor } from "./review.js";
import { openAddSheet } from "./add-sheet.js";

const SVG = "http://www.w3.org/2000/svg";
const svg = (tag, attrs) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

function ring(eaten, goal) {
  const r = 70, c = 2 * Math.PI * r;
  const ratio = goal > 0 ? Math.min(eaten / goal, 1) : 0;
  const over = goal > 0 && eaten > goal;
  const root = svg("svg", { viewBox: "0 0 160 160", class: "ring-svg", "aria-hidden": "true" });
  root.append(
    svg("circle", { cx: 80, cy: 80, r, class: "ring-track" }),
    svg("circle", {
      cx: 80, cy: 80, r,
      class: "ring-value" + (over ? " over" : "") + (ratio === 0 ? " empty" : ""),
      "stroke-dasharray": `${c * ratio} ${c}`,
      transform: "rotate(-90 80 80)",
    }),
  );
  const left = Math.round(goal - eaten);
  return h("div.ring",
    root,
    h("div.ring-center",
      h("div.ring-number", fmt(Math.abs(left), 0)),
      h("div.ring-caption", left >= 0 ? "осталось ккал" : "ккал сверх нормы"),
    ),
  );
}

function bar(label, value, goal, cls) {
  const ratio = goal > 0 ? Math.min(value / goal, 1) : 0;
  return h("div.macro-bar." + cls,
    h("div.macro-bar-head", h("span", label), h("span.macro-bar-num", `${fmt(value, 0)} / ${fmt(goal, 0)} г`)),
    h("div.bar-track", h("div.bar-fill", { style: { width: `${ratio * 100}%` } })),
  );
}

export async function renderToday(root) {
  const date = getCurrentDate();
  const [entries, settings] = await Promise.all([listEntries(date), getSettings()]);
  const goal = settings.goal || { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  const total = sumMacros(entries);
  const isToday = date >= toDateStr();

  const go = (n) => { setCurrentDate(addDays(date, n)); renderToday(root); };

  const header = h("header.day-nav",
    h("button.icon-btn.nav-arrow", { type: "button", "aria-label": "Предыдущий день", onclick: () => go(-1) }, "‹"),
    h("button.day-label", { type: "button", onclick: () => { setCurrentDate(toDateStr()); renderToday(root); } }, dayLabel(date)),
    h("button.icon-btn.nav-arrow", { type: "button", "aria-label": "Следующий день", disabled: isToday, onclick: () => go(1) }, "›"),
  );

  const summary = h("section.summary.card",
    h("div.summary-top",
      h("div.summary-side", h("div.summary-num", fmt(total.kcal, 0)), h("div.summary-cap", "съедено")),
      ring(total.kcal, goal.kcal),
      h("div.summary-side", h("div.summary-num", fmt(goal.kcal, 0)), h("div.summary-cap", "норма")),
    ),
    h("div.macro-bars",
      bar("Белки", total.protein, goal.protein, "protein"),
      bar("Жиры", total.fat, goal.fat, "fat"),
      bar("Углеводы", total.carbs, goal.carbs, "carbs"),
    ),
  );

  const meals = h("section.meals");
  for (const m of MEALS) {
    const list = entries.filter((e) => e.meal === m.id);
    const sum = sumMacros(list);
    meals.append(h("div.meal.card",
      h("div.meal-head",
        h("div.meal-title", h("span", m.label), h("span.meal-kcal", list.length ? `${fmt(sum.kcal, 0)} ккал` : "")),
        h("button.icon-btn.meal-add", { type: "button", "aria-label": `Добавить в «${m.label}»`, onclick: () => openAddSheet({ date, meal: m.id }) }, "+"),
      ),
      list.length ? h("ul.entry-list", list.map((e) => h("li",
        h("button.entry", { type: "button", onclick: () => openEntryEditor(e) },
          h("span.entry-main",
            h("span.entry-name", e.name),
            h("span.entry-sub", entryAmount(e) + `Б ${fmt(e.protein)} · Ж ${fmt(e.fat)} · У ${fmt(e.carbs)}`),
          ),
          h("span.entry-kcal", fmt(e.kcal, 0)),
        )))) : null,
    ));
  }

  const empty = entries.length ? null : h("p.empty-day", "Сфоткай еду или этикетку — кнопка +");

  clear(root).append(...[header, summary, empty, meals].filter(Boolean));
}

function entryAmount(e) {
  if (e.portions) return `${fmt(e.portions.count)} порц. · `;
  if (e.grams) return `${fmt(e.grams, 0)} ${e.unit === "ml" ? "мл" : "г"} · `;
  return "";
}
