// Лист способов добавления по кнопке «+».

import { h, openSheet, toast } from "./dom.js";
import { getCurrentDate } from "./state.js";
import { openRecent } from "./recent.js";
import { openManual } from "./manual.js";

const METHODS = [
  { id: "food", icon: "📷", title: "Сфоткать еду", sub: "ИИ узнает блюда и оценит вес" },
  { id: "label", icon: "🏷️", title: "Сфоткать этикетку", sub: "Прочитает таблицу пищевой ценности" },
  { id: "barcode", icon: "▥", title: "Штрих-код", sub: "Найдёт продукт в Open Food Facts" },
  { id: "recent", icon: "🕘", title: "Недавние", sub: "Всё, что уже вносил" },
  { id: "manual", icon: "✏️", title: "Ввести вручную", sub: "Если ничего не подошло" },
];

/** ctx: { date?, meal? } */
export function openAddSheet(ctx = {}) {
  const c = { date: ctx.date || getCurrentDate(), ...(ctx.meal ? { meal: ctx.meal } : {}) };
  const sheet = openSheet({
    title: "Добавить",
    className: "sheet-auto",
    body: h("div.method-list", METHODS.map((m) =>
      h("button.method" + (m.id === "manual" ? ".method-minor" : ""), { type: "button", onclick: () => pick(m.id) },
        h("span.method-icon", { "aria-hidden": "true" }, m.icon),
        h("span.method-text", h("span.method-title", m.title), h("span.method-sub", m.sub)),
        h("span.method-chevron", { "aria-hidden": "true" }, "›"),
      ))),
  });

  async function pick(id) {
    sheet.close();
    if (id === "recent") return openRecent(c);
    if (id === "manual") return openManual(c);
    try {
      const { openCapture } = await import("./capture.js");
      openCapture(id, c);
    } catch (err) {
      console.error(err);
      toast("Не получилось открыть этот способ. Проверь связь и попробуй ещё раз");
    }
  }
}
