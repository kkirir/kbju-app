// Настройки: ключ Claude API, модель, профиль и норма, экспорт/импорт.

import { getSettings, saveSettings, exportAll, importAll } from "../store.js";
import { DEFAULT_MODEL } from "../ai.js";
import { calcGoal } from "../nutrition.js";
import { h, clear, segmented, confirmDialog, toast } from "./dom.js";
import { profileForm, goalFields, profileComplete } from "./profile.js";
import { notifyChanged, toDateStr } from "./state.js";

const MODELS = [
  { id: "claude-sonnet-5-5", label: "Sonnet — точнее" },
  { id: "claude-haiku-5-5", label: "Haiku — дешевле" },
];

const NO_KEY = "Сначала вставь ключ";
const BAD_KEY = "Ключ не подошёл";

export async function renderSettings(root) {
  const s = await getSettings();

  // --- Ключ ---
  const keyInput = h("input.input", {
    type: "password", value: s.apiKey || "", placeholder: "sk-ant-…",
    autocomplete: "off", autocapitalize: "off", spellcheck: false,
  });
  keyInput.setAttribute("autocorrect", "off");
  const toggle = h("button.btn.btn-secondary.btn-small", { type: "button" }, "Показать");
  toggle.addEventListener("click", () => {
    const hidden = keyInput.type === "password";
    keyInput.type = hidden ? "text" : "password";
    toggle.textContent = hidden ? "Скрыть" : "Показать";
  });
  const keyStatus = h("p.hint", { role: "status" });
  const saveKey = h("button.btn.btn-primary", { type: "button" }, "Сохранить");
  const checkBtn = h("button.btn.btn-secondary", { type: "button" }, "Проверить ключ");

  saveKey.addEventListener("click", async () => {
    await saveSettings({ apiKey: keyInput.value.trim() });
    keyStatus.textContent = keyInput.value.trim() ? "Ключ сохранён на этом телефоне" : "Ключ удалён";
  });

  checkBtn.addEventListener("click", async () => {
    const apiKey = keyInput.value.trim();
    if (!apiKey) { keyStatus.textContent = NO_KEY; return; }
    checkBtn.disabled = true;
    keyStatus.textContent = "Проверяю…";
    try {
      const { checkKey } = await import("../ai.js");
      const { model } = await getSettings();
      const ok = await checkKey({ apiKey, model: model || DEFAULT_MODEL });
      keyStatus.textContent = ok === false ? BAD_KEY : "Ключ работает ✓";
    } catch (err) {
      if (err?.kind && err.message) keyStatus.textContent = err.message;
      else { console.error(err); keyStatus.textContent = "Проверка пока недоступна"; }
    } finally {
      checkBtn.disabled = false;
    }
  });

  const keySection = h("section.card.settings-section",
    h("h2.section-title", "Ключ Claude API"),
    h("p.hint", "Нужен для распознавания фото. Хранится только на этом телефоне и уходит только в api.anthropic.com. Взять ключ: ",
      h("a", { href: "https://console.anthropic.com/settings/keys", target: "_blank", rel: "noopener" }, "console.anthropic.com"),
      " → API Keys → Create Key, затем вставь его сюда."),
    h("div.key-row", keyInput, toggle),
    h("div.btn-row", checkBtn, saveKey),
    keyStatus,
  );

  // --- Модель ---
  const modelSection = h("section.card.settings-section",
    h("h2.section-title", "Модель"),
    segmented(MODELS, MODELS.some((m) => m.id === s.model) ? s.model : DEFAULT_MODEL, async (id) => {
      await saveSettings({ model: id });
      toast("Модель сохранена");
    }),
  );

  // --- Профиль и норма ---
  let goalManual = !!s.goalManual;
  const manualNote = h("p.hint");
  const updateNote = () => {
    manualNote.textContent = goalManual
      ? "Норма задана вручную и не меняется сама. Чтобы посчитать заново по анкете — «Пересчитать»."
      : "Норма считается по анкете автоматически. Можно поправить любую цифру.";
  };
  updateNote();

  const goal = goalFields(s.goal, async (g) => {
    goalManual = true;
    updateNote();
    await saveSettings({ goal: g, goalManual: true });
    notifyChanged("settings");
  });

  const form = profileForm(s.profile, async (p) => {
    const patch = { profile: p };
    if (!goalManual && profileComplete(p)) {
      patch.goal = calcGoal(p);
      goal.set(patch.goal);
    }
    await saveSettings(patch);
    notifyChanged("settings");
  });

  const recalc = h("button.btn.btn-secondary", { type: "button" }, "Пересчитать");
  recalc.addEventListener("click", async () => {
    const p = form.get();
    if (!profileComplete(p)) return toast("Заполни возраст, рост и вес");
    const g = calcGoal(p);
    goal.set(g);
    goalManual = false;
    updateNote();
    await saveSettings({ profile: p, goal: g, goalManual: false });
    notifyChanged("settings");
    toast("Норма пересчитана");
  });

  const profileSection = h("section.card.settings-section",
    h("h2.section-title", "Профиль"),
    form.el,
    h("h2.section-title", "Норма на день"),
    goal.el,
    manualNote,
    recalc,
  );

  // --- Данные ---
  const fileInput = h("input", { type: "file", accept: "application/json,.json", hidden: true });
  const dataStatus = h("p.hint.error-text", { role: "status" });
  const exportBtn = h("button.btn.btn-secondary", { type: "button" }, "Экспорт");
  const importBtn = h("button.btn.btn-secondary", { type: "button", onclick: () => fileInput.click() }, "Импорт");

  exportBtn.addEventListener("click", async () => {
    let json;
    try { json = await exportAll(); }
    catch (err) { console.error(err); toast("Не получилось выгрузить данные"); return; }
    const name = `kbju-${toDateStr()}.json`;
    const blob = new Blob([json], { type: "application/json" });
    const file = typeof File === "function" ? new File([blob], name, { type: "application/json" }) : null;
    if (file && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; }
      catch (err) { if (err?.name === "AbortError") return; }
    }
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    let text;
    try { text = await file.text(); JSON.parse(text); }
    catch { dataStatus.textContent = "Файл не читается как JSON"; toast("Файл не загружен"); return; }
    const yes = await confirmDialog({
      title: "Заменить данные?",
      text: "Все текущие записи, недавние продукты и профиль заменятся данными из файла. Ключ API останется прежним.",
      ok: "Заменить",
      danger: true,
    });
    if (!yes) return;
    try {
      const n = await importAll(text);
      toast(`Загружено: записей ${n.entries}, продуктов ${n.products}`);
      notifyChanged("all");
      renderSettings(root);
    } catch (err) {
      console.error(err);
      dataStatus.textContent = err?.message || "Не получилось загрузить, данные не тронуты";
      toast("Файл не загружен");
    }
  });

  const dataSection = h("section.card.settings-section",
    h("h2.section-title", "Данные"),
    h("p.hint", "Всё хранится на этом телефоне. Экспорт сохраняет файл JSON (без ключа API), импорт восстанавливает из него."),
    h("div.btn-row", exportBtn, importBtn),
    dataStatus,
    fileInput,
  );

  clear(root).append(
    h("header.page-head", h("h1.page-title", "Настройки")),
    keySection, modelSection, profileSection, dataSection,
  );
}
