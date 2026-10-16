// Заглушка. Настоящие фото-режимы делает таск 03 с той же сигнатурой.
// mode: "food" | "label" | "barcode"; ctx: { date: "YYYY-MM-DD", meal? }

import { h, openSheet } from "./dom.js";

const TITLES = { food: "Сфоткать еду", label: "Сфоткать этикетку", barcode: "Штрих-код" };

export function openCapture(mode, ctx = {}) {
  const sheet = openSheet({
    title: TITLES[mode] || "Фото",
    className: "sheet-small",
    body: h("p.dialog-text", "Скоро: этот способ появится в следующем обновлении. Пока можно выбрать из «Недавних» или ввести вручную."),
    footer: [h("button.btn.btn-primary", { type: "button", onclick: () => sheet.close() }, "Понятно")],
  });
  return sheet;
}
