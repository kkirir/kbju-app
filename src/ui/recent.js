// «Недавние»: список продуктов с поиском; тап → экран граммов с прошлым количеством.

import { listProducts } from "../store.js";
import { h, clear, fmt, openSheet } from "./dom.js";
import { openReview, macroLine } from "./review.js";

/** ctx: { date, meal? } */
export function openRecent(ctx = {}) {
  const search = h("input.input.search", { type: "search", placeholder: "Поиск по названию", autocomplete: "off", enterKeyHint: "search" });
  const list = h("div.recent-list");
  const sheet = openSheet({ title: "Недавние", body: h("div", search, list) });

  let seq = 0;
  async function render() {
    const my = ++seq;
    const products = await listProducts(search.value);
    if (my !== seq) return;
    clear(list);
    if (!products.length) {
      list.append(h("p.empty-note", search.value.trim()
        ? "Ничего не нашлось"
        : "Здесь появятся продукты, которые ты уже вносил: по фото, этикетке или вручную."));
      return;
    }
    for (const p of products) {
      const unit = p.unit === "ml" ? "мл" : "г";
      const sub = p.per100
        ? `${fmt(p.per100.kcal, 0)} ккал на 100 ${unit}` + (p.lastGrams ? ` · было ${fmt(p.lastGrams)} ${unit}` : "")
        : p.perPortion ? `${macroLine(p.perPortion)} за порцию` : "";
      list.append(h("button.recent-item", { type: "button", onclick: () => pick(p) },
        h("span.recent-name", p.name),
        h("span.recent-sub", sub),
      ));
    }
  }

  function pick(p) {
    sheet.close();
    openReview({
      kind: "product",
      name: p.name,
      per100: p.per100 || null,
      perPortion: p.perPortion || null,
      unit: p.unit || "g",
      suggestions: p.suggestions || [],
      defaultGrams: p.lastGrams || undefined,
      defaultCount: p.lastCount || undefined,
      source: "recent",
      date: ctx.date,
      meal: ctx.meal,
    });
  }

  search.addEventListener("input", render);
  render();
}
