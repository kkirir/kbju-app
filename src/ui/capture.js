// Экраны съёмки: фото еды, этикетка, штрих-код.
// openCapture(mode, ctx): mode — "food" | "label" | "barcode"; ctx — { date: "YYYY-MM-DD", meal? }.
// Камера и галерея — отдельные <input type="file">, capture="environment" только у камеры.
// Подготовленное фото держится в памяти до сохранения или закрытия: «Повторить» его не пересжимает.

import { h, clear, openSheet } from "./dom.js";
import { openReview } from "./review.js";
import { getSettings } from "../store.js";
import { prepareImage } from "../image.js";
import { analyzeFood, readLabel, readBarcode } from "../ai.js";
import { lookupBarcode } from "../foodfacts.js";
import { normalizeLabel, scale } from "../nutrition.js";

const MODES = {
  food: {
    title: "Сфоткать еду",
    intro: "Сфоткай тарелку целиком, сверху или под небольшим углом. ИИ узнает блюда и оценит вес.",
    busy: "Распознаю еду…",
    notOk: "Не разобрать еду",
  },
  label: {
    title: "Сфоткать этикетку",
    intro: "Сфоткай таблицу «Пищевая ценность» целиком, без бликов. Штрих-код не нужен.",
    busy: "Считываю этикетку…",
    notOk: "Этикетка не читается",
  },
  barcode: {
    title: "Штрих-код",
    intro: "Сфоткай штрих-код крупно и ровно, чтобы читались цифры под ним.",
    busy: "Читаю штрих-код…",
    notOk: "Штрих-код не читается",
  },
};

const LABEL_FALLBACK_NAME = "Продукт с этикетки";
const CONSOLE_URL = "https://console.anthropic.com/settings/keys";
const OFF_NETWORK_TEXT = "Нет связи с Open Food Facts. Проверь интернет и нажми «Повторить».";

// kind ошибки → заголовок и набор кнопок. Текст — из err.message (AiError уже по-русски).
const ERRORS = {
  "no-key": { title: "Нужен ключ Claude API", actions: "settings", steps: true },
  "bad-key": { title: "Ключ не подошёл", actions: "settings" },
  network: { title: "Не удалось связаться, попробуй ещё раз", actions: "retry" },
  rate: { title: "Не удалось связаться, попробуй ещё раз", actions: "retry" },
  "bad-response": { title: "Не получилось разобрать ответ", actions: "retry" },
};
const UNKNOWN_ERROR = { title: "Что-то пошло не так", actions: "retry" };

/** Кнопка-подпись с невидимым input внутри: тап по ней открывает камеру или галерею. */
function pickButton(text, { camera, primary, onFile }) {
  const input = h("input.file-input", { type: "file", accept: "image/*", tabIndex: -1 });
  if (camera) input.setAttribute("capture", "environment");
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    input.value = ""; // тот же файл можно выбрать ещё раз
    if (file) onFile(file);
  });
  return h("label.btn.pick-btn" + (primary ? ".btn-primary" : ".btn-secondary"), { role: "button" }, text, input);
}

/** Пара «галерея + камера» для футера. */
function pickPair(cameraText, onFile) {
  return [
    pickButton("Из галереи", { camera: false, onFile }),
    pickButton(cameraText, { camera: true, primary: true, onFile }),
  ];
}

function goToSettings() {
  window.dispatchEvent(new CustomEvent("kbju:navigate", { detail: { tab: "settings" } }));
}

export function openCapture(initialMode, ctx = {}) {
  let mode = MODES[initialMode] ? initialMode : "food";
  let file = null;       // исходный файл
  let previewUrl = null; // objectURL превью
  let img = null;        // подготовленное фото { base64, mediaType }
  let code = null;       // прочитанный штрих-код (повтор поиска без повторного запроса к ИИ)
  let hint = "";
  let busy = false;
  let closed = false;

  const root = h("div.capture");
  const sheet = openSheet({
    title: MODES[mode].title,
    body: root,
    onClose: () => {
      closed = true;
      dropPhoto();
    },
  });

  function setMode(m) {
    mode = m;
    sheet.setTitle(MODES[m].title);
  }

  function dropPhoto() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    file = null;
    img = null;
    code = null;
  }

  function preview() {
    return previewUrl ? h("div.capture-preview", h("img", { src: previewUrl, alt: "Фото" })) : null;
  }

  function render(...nodes) {
    clear(root).append(...nodes.flat().filter(Boolean));
    sheet.setFooter();
  }

  const btn = (text, onclick, primary = false) =>
    h("button.btn" + (primary ? ".btn-primary" : ".btn-secondary"), { type: "button", onclick }, text);

  // ---------- экраны ----------

  function showPick() {
    dropPhoto();
    render(
      h("p.dialog-text", MODES[mode].intro),
      h("div.btn-row.pick-row",
        pickButton("Снять", { camera: true, primary: true, onFile: usePhoto }),
        pickButton("Из галереи", { camera: false, onFile: usePhoto }),
      ),
    );
  }

  function showPhoto() {
    // Только для еды: превью, уточнение, «Распознать».
    const area = h("textarea.input.capture-hint", {
      rows: 2,
      placeholder: "Например: 2 яйца, жарил без масла",
      value: hint,
    });
    area.addEventListener("input", () => { hint = area.value; });
    render(
      preview(),
      h("label.field", h("span.field-label", "Уточнение (необязательно)"), area),
    );
    sheet.setFooter(
      btn("Переснять", showPick),
      btn("Распознать", () => run(), true),
    );
  }

  function showBusy(text) {
    render(
      preview(),
      h("div.capture-busy", { role: "status", "aria-live": "polite" }, h("span.spinner", { "aria-hidden": "true" }), h("span", text)),
    );
  }

  function showMessage({ title, text, steps, actions }) {
    render(
      preview(),
      h("div.capture-msg", { role: "alert" },
        h("h3.capture-msg-title", title),
        text ? h("p.dialog-text", text) : null,
        steps || null,
      ),
    );
    sheet.setFooter(...actions);
  }

  function keySteps() {
    return h("ol.capture-steps",
      h("li", "Открой ", h("a", { href: CONSOLE_URL, target: "_blank", rel: "noopener" }, "console.anthropic.com"), " и войди."),
      h("li", "Раздел API Keys → Create Key, скопируй ключ (начинается с sk-ant-)."),
      h("li", "Вставь его в «Настройках» и нажми «Сохранить»."),
    );
  }

  function errorActions(kind) {
    if (kind === "settings") return [btn("Закрыть", () => sheet.close()), btn("В настройки", () => { sheet.close(); goToSettings(); }, true)];
    return [btn("Переснять", showPick), btn("Повторить", () => run(), true)];
  }

  function showError(err, text) {
    const view = ERRORS[err && err.kind] || UNKNOWN_ERROR;
    if (view === UNKNOWN_ERROR) console.error(err);
    showMessage({
      title: view.title,
      text: text || (err && err.message) || "Попробуй ещё раз.",
      steps: view.steps ? keySteps() : null,
      actions: errorActions(view.actions),
    });
  }

  // ok:false или фото не открылось — переснять камерой или выбрать из галереи.
  function showRetake(title, text) {
    showMessage({ title, text, actions: pickPair("Переснять", usePhoto) });
  }

  function showNotFound() {
    showMessage({
      title: "Продукта нет в базе",
      text: `Штрих-кода ${code} нет в Open Food Facts. Сфоткай этикетку с таблицей пищевой ценности — так тоже посчитается.`,
      actions: pickPair("Сфоткать этикетку", (f) => { setMode("label"); usePhoto(f); }),
    });
  }

  // ---------- работа ----------

  function usePhoto(f) {
    if (busy) return;
    dropPhoto();
    file = f;
    previewUrl = URL.createObjectURL(f);
    if (mode === "food") showPhoto();
    else run();
  }

  async function run() {
    if (busy || closed || !file) return; // защита от двойного нажатия
    busy = true;
    try {
      if (!img) {
        showBusy("Готовлю фото…");
        try {
          img = await prepareImage(file);
        } catch (e) {
          console.error(e);
          if (!closed) showRetake("Не удалось открыть фото", "Попробуй снять ещё раз или выбери другое фото.");
          return;
        }
        if (closed) return;
      }
      const s = await getSettings();
      const cfg = { apiKey: s.apiKey, model: s.model };
      if (mode === "food") await runFood(cfg);
      else if (mode === "label") await runLabel(cfg);
      else await runBarcode(cfg);
    } catch (err) {
      if (!closed) showError(err);
    } finally {
      busy = false;
    }
  }

  function toReview(reviewCtx) {
    sheet.close();
    return openReview({ ...reviewCtx, date: ctx.date, meal: ctx.meal });
  }

  async function runFood(cfg) {
    showBusy(MODES.food.busy);
    const res = await analyzeFood(img, hint, cfg);
    if (closed) return;
    if (!res.ok) return showRetake(MODES.food.notOk, res.reason);
    toReview({ kind: "items", items: res.items, source: "photo" });
  }

  async function runLabel(cfg) {
    showBusy(MODES.label.busy);
    const res = await readLabel(img, cfg);
    if (closed) return;
    if (!res.ok) return showRetake(MODES.label.notOk, res.reason);
    const n = normalizeLabel(res);
    toReview({
      kind: "product",
      name: res.name || LABEL_FALLBACK_NAME,
      per100: n.per100,
      perPortion: n.perPortion,
      unit: n.unit,
      suggestions: n.suggestions,
      source: "label",
    });
  }

  async function runBarcode(cfg) {
    if (!code) {
      showBusy(MODES.barcode.busy);
      const res = await readBarcode(img, cfg);
      if (closed) return;
      if (!res.ok) return showRetake(MODES.barcode.notOk, res.reason);
      code = res.code;
    }
    showBusy(`Ищу ${code} в Open Food Facts…`);
    let p;
    try {
      p = await lookupBarcode(code);
    } catch (e) {
      if (closed) return;
      if (e && e.kind === "network") return showError(e, OFF_NETWORK_TEXT);
      throw e;
    }
    if (closed) return;
    if (!p) return showNotFound();
    const suggestions = [...new Set([p.servingGrams, p.packageGrams].filter((v) => Number(v) > 0))];
    toReview({
      kind: "product",
      name: p.name,
      per100: p.per100,
      perPortion: p.servingGrams ? scale(p.per100, p.servingGrams) : null,
      unit: "g",
      suggestions,
      source: "barcode",
    });
  }

  showPick();
  return sheet;
}
