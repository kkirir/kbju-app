// Мелкие помощники для DOM: создание элементов, листы, подтверждения, тосты.

import { parseNumber } from "../nutrition.js";

/** h("div.card", { onclick }, child, "текст") */
export function h(tag, props, ...children) {
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name || "div");
  if (classes.length) el.className = classes.join(" ");
  if (props && (typeof props !== "object" || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className += (el.className ? " " : "") + v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k in el && k !== "list" && k !== "inputmode") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export const MEALS = [
  { id: "breakfast", label: "Завтрак" },
  { id: "lunch", label: "Обед" },
  { id: "dinner", label: "Ужин" },
  { id: "snack", label: "Перекус" },
];
export const mealLabel = (id) => MEALS.find((m) => m.id === id)?.label || "Перекус";

/** Число для показа: целые без дробей, иначе до десятых, с запятой. */
export function fmt(v, digits = 1) {
  const n = Number(v) || 0;
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return String(r).replace(".", ",");
}

/** Разбор числа из поля ввода: запятая или точка; пусто/мусор → null. */
export function parseNum(v) {
  const n = parseNumber(v);
  return n !== null && n >= 0 ? n : null;
}

/** Числовое поле с подписью. */
export function numberField(label, value, { onInput, suffix, placeholder, step = "any" } = {}) {
  const input = h("input.input", {
    type: "text",
    inputMode: "decimal",
    value: value === null || value === undefined ? "" : fmt(value),
    placeholder: placeholder || "",
    enterKeyHint: "done",
    autocomplete: "off",
  });
  input.setAttribute("inputmode", "decimal");
  if (onInput) input.addEventListener("input", () => onInput(parseNum(input.value), input));
  input.addEventListener("focus", () => input.select());
  const wrap = h("label.field", h("span.field-label", label), h("span.field-row", input, suffix ? h("span.field-suffix", suffix) : null));
  wrap.input = input;
  return wrap;
}

export function textField(label, value, { onInput, placeholder, type = "text" } = {}) {
  const input = h("input.input", { type, value: value || "", placeholder: placeholder || "", autocomplete: "off" });
  if (onInput) input.addEventListener("input", () => onInput(input.value, input));
  const wrap = h("label.field", h("span.field-label", label), input);
  wrap.input = input;
  return wrap;
}

/** Переключатель-сегменты. options: [{id, label}] */
export function segmented(options, value, onChange) {
  const root = h("div.segmented", { role: "radiogroup" });
  const render = (current) => {
    clear(root);
    for (const o of options) {
      root.append(h("button.seg" + (o.id === current ? ".active" : ""), {
        type: "button",
        role: "radio",
        "aria-checked": String(o.id === current),
        onclick: () => { render(o.id); onChange(o.id); },
      }, o.label));
    }
  };
  render(value);
  root.set = render;
  return root;
}

// ---------- Листы ----------

const sheetStack = [];

/**
 * Лист снизу на весь экран. Возвращает { el, body, footer, close }.
 * onClose вызывается один раз при любом закрытии.
 */
export function openSheet({ title, body, footer, onClose, className } = {}) {
  const closeBtn = h("button.icon-btn", { type: "button", "aria-label": "Закрыть" }, "✕");
  const bodyEl = h("div.sheet-body", body);
  const footerEl = h("div.sheet-footer", footer);
  if (!footer) footerEl.hidden = true;
  const panel = h("div.sheet" + (className ? "." + className : ""), { role: "dialog", "aria-modal": "true", "aria-label": title || "" },
    h("div.sheet-head", h("h2.sheet-title", title || ""), closeBtn),
    bodyEl,
    footerEl,
  );
  const overlay = h("div.overlay", panel);
  document.body.append(overlay);
  document.body.classList.add("no-scroll");
  requestAnimationFrame(() => overlay.classList.add("open"));

  let closed = false;
  const api = {
    el: panel,
    body: bodyEl,
    footer: footerEl,
    setFooter(...nodes) { clear(footerEl); append(footerEl, nodes); footerEl.hidden = !nodes.length; },
    close() {
      if (closed) return;
      closed = true;
      const i = sheetStack.indexOf(api);
      if (i >= 0) sheetStack.splice(i, 1);
      overlay.classList.remove("open");
      overlay.classList.add("closing");
      setTimeout(() => overlay.remove(), 220);
      if (!sheetStack.length) document.body.classList.remove("no-scroll");
      onClose?.();
    },
  };
  closeBtn.addEventListener("click", () => api.close());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) api.close(); });
  sheetStack.push(api);
  return api;
}

export function closeAllSheets() {
  for (const s of [...sheetStack].reverse()) s.close();
}

/** Подтверждение. Возвращает Promise<boolean>. */
export function confirmDialog({ title, text, ok = "Да", cancel = "Отмена", danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v) => { if (!answered) { answered = true; resolve(v); } dialog.close(); };
    const dialog = openSheet({
      title,
      className: "sheet-small",
      body: h("p.dialog-text", text),
      footer: [
        h("button.btn.btn-secondary", { type: "button", onclick: () => done(false) }, cancel),
        h("button.btn" + (danger ? ".btn-danger" : ".btn-primary"), { type: "button", onclick: () => done(true) }, ok),
      ],
      onClose: () => { if (!answered) { answered = true; resolve(false); } },
    });
  });
}

let toastTimer = null;
export function toast(text) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = h("div.toast", { role: "status", "aria-live": "polite" });
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}
