// Общий экран проверки перед сохранением + редактор существующей записи.
//
// openReview(ctx) — для фото еды, этикетки, штрих-кода, недавних и ручного ввода.
//   ctx.kind === "items":   { items: [{ name, grams, kcal, protein, fat, carbs }], source }
//   ctx.kind === "product": { name, per100|null, perPortion|null, unit, suggestions, source,
//                             defaultGrams?, defaultCount? }
//   общее (необязательно): date ("YYYY-MM-DD", по умолчанию выбранный день), meal, title
// Возвращает Promise<Entry[] | null>: сохранённые записи или null, если нажали «Отмена».
//
// openEntryEditor(entry) — правка/удаление записи из дневника.

import { scale, sumMacros, toPer100, times, round, mealByHour } from "../nutrition.js";
import { saveEntry, deleteEntry, upsertProduct } from "../store.js";
import { h, clear, fmt, numberField, textField, segmented, openSheet, confirmDialog, toast, MEALS, mealLabel } from "./dom.js";
import { getCurrentDate, notifyChanged } from "./state.js";

const MACRO_FIELDS = [
  { key: "kcal", label: "Ккал", suffix: "ккал" },
  { key: "protein", label: "Белки", suffix: "г" },
  { key: "fat", label: "Жиры", suffix: "г" },
  { key: "carbs", label: "Углеводы", suffix: "г" },
];

const ZERO = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
const pickMacros = (o) => ({ kcal: +o?.kcal || 0, protein: +o?.protein || 0, fat: +o?.fat || 0, carbs: +o?.carbs || 0 });
const unitLabel = (unit) => (unit === "ml" ? "мл" : "г");

/** Строка «320 ккал · Б 12 · Ж 8 · У 40» */
export function macroLine(m) {
  return `${fmt(m.kcal, 0)} ккал · Б ${fmt(m.protein)} · Ж ${fmt(m.fat)} · У ${fmt(m.carbs)}`;
}

/**
 * Редактор одной позиции. state:
 * { name, grams|null, count|null, per100|null, perPortion|null, macros, unit }
 * Режим «порции» — когда per100 нет, а perPortion есть.
 */
function itemEditor(state, { suggestions = [], onChange, onRemove, compact = false } = {}) {
  const portions = !state.per100 && !!state.perPortion;
  const u = unitLabel(state.unit);
  const macroInputs = {};
  const per100Line = h("p.hint");

  const refresh = (skip) => {
    for (const f of MACRO_FIELDS) {
      const input = macroInputs[f.key];
      if (input !== skip) input.value = fmt(state.macros[f.key], f.key === "kcal" ? 0 : 1);
    }
    if (portions) per100Line.textContent = state.perPortion ? `1 порция: ${macroLine(state.perPortion)}` : "";
    else per100Line.textContent = state.per100 ? `На 100 ${u}: ${macroLine(state.per100)}` : "";
    onChange?.();
  };

  const name = textField("Название", state.name, { onInput: (v) => { state.name = v; onChange?.(); }, placeholder: "Например, гречка" });

  let amount;
  const setAmount = (v, skip) => {
    if (portions) {
      state.count = v;
      state.macros = times(state.perPortion, v || 0);
    } else {
      state.grams = v;
      if (state.per100) state.macros = scale(state.per100, v || 0);
      else if (v > 0) state.per100 = toPer100(state.macros, v);
    }
    if (skip !== amount.input) amount.input.value = v === null ? "" : fmt(v);
    refresh();
  };
  amount = portions
    ? numberField("Порций", state.count, { onInput: (v, input) => setAmount(v, input), suffix: "шт" })
    : numberField(state.unit === "ml" ? "Объём" : "Вес", state.grams, { onInput: (v, input) => setAmount(v, input), suffix: u });

  const chipValues = portions ? [0.5, 1, 2] : suggestions;
  const chips = chipValues.length
    ? h("div.chips", chipValues.map((v) => h("button.chip", { type: "button", onclick: () => setAmount(v) }, portions ? `${fmt(v)} порц.` : `${fmt(v)} ${u}`)))
    : null;

  const grid = h("div.macro-grid");
  for (const f of MACRO_FIELDS) {
    const field = numberField(f.label, state.macros[f.key], {
      suffix: f.suffix,
      onInput: (v, input) => {
        state.macros = { ...state.macros, [f.key]: v ?? 0 };
        if (portions) {
          if (state.count > 0) state.perPortion = times(state.macros, 1 / state.count);
        } else if (state.grams > 0) {
          state.per100 = toPer100(state.macros, state.grams);
        }
        refresh(input);
      },
    });
    macroInputs[f.key] = field.input;
    grid.append(field);
  }

  const el = h("div.item-editor" + (compact ? ".compact" : ""),
    onRemove ? h("button.icon-btn.item-remove", { type: "button", "aria-label": "Убрать позицию", onclick: onRemove }, "✕") : null,
    name,
    amount,
    chips,
    grid,
    per100Line,
  );
  refresh();
  return { el, state, focusAmount: () => amount.input.focus() };
}

/** Преобразовать состояние редактора в поля записи дневника. */
function toEntryFields(state) {
  const name = String(state.name || "").trim();
  if (!state.per100 && state.perPortion) {
    const count = state.count || 0;
    return {
      name,
      grams: null,
      ...round(times(state.perPortion, count)),
      per100: null,
      portions: { count, perPortion: round(state.perPortion) },
    };
  }
  const grams = state.grams > 0 ? state.grams : null;
  const macros = state.per100 && grams ? scale(state.per100, grams) : state.macros;
  return { name, grams, ...round(macros), per100: state.per100 && grams ? round(state.per100) : null };
}

function validate(state) {
  if (!String(state.name || "").trim()) return "Впиши название";
  if (!state.per100 && state.perPortion) return state.count > 0 ? null : "Укажи число порций";
  if (state.per100 && !(state.grams > 0)) return "Укажи, сколько съел";
  return null;
}

function mealPicker(initial, onChange) {
  return h("div.meal-picker",
    h("span.field-label", "Приём пищи"),
    segmented(MEALS, initial, onChange),
  );
}

// ---------- openReview ----------

export function openReview(ctx) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };

    const date = ctx.date || getCurrentDate();
    let meal = ctx.meal || mealByHour(new Date().getHours());
    const saveBtn = h("button.btn.btn-primary", { type: "button" });
    const cancelBtn = h("button.btn.btn-secondary", { type: "button" }, "Отмена");
    const updateSaveLabel = () => { saveBtn.textContent = `Сохранить в «${mealLabel(meal)}»`; };

    const body = h("div.review");
    const totalEl = h("div.review-total");
    const editors = [];

    const renderTotal = () => {
      const t = sumMacros(editors.filter((e) => !e.removed).map((e) => toEntryFields(e.state)));
      clear(totalEl).append(
        h("div.review-kcal", h("strong", fmt(t.kcal, 0)), " ккал"),
        h("div.review-macros", `Б ${fmt(t.protein)} · Ж ${fmt(t.fat)} · У ${fmt(t.carbs)}`),
      );
      const active = editors.filter((e) => !e.removed).length;
      saveBtn.disabled = active === 0;
    };

    body.append(totalEl);

    if (ctx.kind === "items") {
      const list = h("div.item-list");
      for (const item of ctx.items || []) {
        const grams = Number(item.grams) > 0 ? Number(item.grams) : null;
        const macros = pickMacros(item);
        const state = { name: item.name || "", grams, count: null, per100: grams ? toPer100(macros, grams) : null, perPortion: null, macros, unit: "g" };
        const rec = { state, removed: false };
        const ed = itemEditor(state, {
          compact: true,
          onChange: renderTotal,
          onRemove: () => {
            rec.removed = true;
            ed.el.remove();
            if (!editors.some((e) => !e.removed)) list.append(h("p.empty-note", "Позиций не осталось"));
            renderTotal();
          },
        });
        editors.push(rec);
        list.append(ed.el);
      }
      if (!editors.length) list.append(h("p.empty-note", "Позиций нет"));
      body.append(list);
    } else {
      const per100 = ctx.per100 ? pickMacros(ctx.per100) : null;
      const perPortion = ctx.perPortion ? pickMacros(ctx.perPortion) : null;
      const suggestions = [...new Set([ctx.defaultGrams, ...(ctx.suggestions || [])].filter((v) => Number(v) > 0).map(Number))];
      const grams = per100 ? (Number(ctx.defaultGrams) > 0 ? Number(ctx.defaultGrams) : suggestions[0] || 100) : null;
      const count = !per100 && perPortion ? (Number(ctx.defaultCount) > 0 ? Number(ctx.defaultCount) : 1) : null;
      const macros = per100 ? scale(per100, grams) : perPortion ? times(perPortion, count) : { ...ZERO };
      const state = { name: ctx.name || "", grams, count, per100, perPortion, macros, unit: ctx.unit === "ml" ? "ml" : "g" };
      const ed = itemEditor(state, { suggestions, onChange: renderTotal });
      editors.push({ state, removed: false });
      body.append(ed.el);
      setTimeout(() => { if (!state.name) ed.el.querySelector("input")?.focus(); }, 250);
    }

    body.append(mealPicker(meal, (m) => { meal = m; updateSaveLabel(); }));
    updateSaveLabel();

    const sheet = openSheet({
      title: ctx.title || (ctx.kind === "items" ? "Проверь, что на тарелке" : "Сколько съел?"),
      body,
      footer: [cancelBtn, saveBtn],
      onClose: () => finish(null),
    });
    renderTotal();

    cancelBtn.addEventListener("click", () => sheet.close());
    saveBtn.addEventListener("click", async () => {
      const active = editors.filter((e) => !e.removed);
      for (const e of active) {
        const err = validate(e.state);
        if (err) { toast(err); return; }
      }
      saveBtn.disabled = true;
      try {
        const saved = [];
        const baseTime = Date.now();
        for (const [i, e] of active.entries()) {
          const fields = toEntryFields(e.state);
          const entry = await saveEntry({ ...fields, unit: e.state.unit, date, meal, source: ctx.source || "manual", createdAt: baseTime + i });
          saved.push(entry);
          await upsertProduct({
            name: fields.name,
            per100: fields.per100,
            perPortion: fields.portions?.perPortion || (e.state.perPortion ? round(e.state.perPortion) : null),
            unit: e.state.unit,
            suggestions: ctx.kind === "product" ? (ctx.suggestions || []) : [],
            lastGrams: fields.grams,
            lastCount: fields.portions?.count ?? null,
            source: ctx.source || "manual",
          });
        }
        finish(saved);
        notifyChanged("entries");
        sheet.close();
        toast(saved.length > 1 ? `Сохранено: ${saved.length}` : "Сохранено");
      } catch (err) {
        console.error(err);
        toast("Не получилось сохранить");
        saveBtn.disabled = false;
      }
    });
  });
}

// ---------- Редактор записи ----------

export function openEntryEditor(entry) {
  return new Promise((resolve) => {
    let meal = entry.meal;
    const portions = entry.portions && !entry.per100;
    const state = {
      name: entry.name,
      grams: entry.grams,
      count: portions ? entry.portions.count : null,
      per100: entry.per100 ? pickMacros(entry.per100) : null,
      perPortion: portions ? pickMacros(entry.portions.perPortion) : null,
      macros: pickMacros(entry),
      unit: entry.unit === "ml" ? "ml" : "g",
    };
    const ed = itemEditor(state);
    const saveBtn = h("button.btn.btn-primary", { type: "button" }, "Сохранить");
    const delBtn = h("button.btn.btn-danger-ghost", { type: "button" }, "Удалить");
    const sheet = openSheet({
      title: "Запись",
      body: h("div.review", ed.el, mealPicker(meal, (m) => { meal = m; })),
      footer: [delBtn, saveBtn],
      onClose: () => resolve(),
    });

    saveBtn.addEventListener("click", async () => {
      const err = validate(state);
      if (err) { toast(err); return; }
      const fields = toEntryFields(state);
      const next = { ...entry, ...fields, unit: state.unit, meal };
      if (!fields.portions) delete next.portions;
      saveBtn.disabled = true;
      try {
        await saveEntry(next);
      } catch (err) {
        console.error(err);
        toast("Не получилось сохранить");
        saveBtn.disabled = false;
        return;
      }
      notifyChanged("entries");
      sheet.close();
      toast("Сохранено");
    });

    delBtn.addEventListener("click", async () => {
      const yes = await confirmDialog({ title: "Удалить запись?", text: `«${entry.name}» пропадёт из дневника.`, ok: "Удалить", danger: true });
      if (!yes) return;
      try {
        await deleteEntry(entry.id);
      } catch (err) {
        console.error(err);
        toast("Не получилось удалить");
        return;
      }
      notifyChanged("entries");
      sheet.close();
      toast("Удалено");
    });
  });
}
