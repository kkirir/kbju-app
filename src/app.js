// Точка входа: первый запуск, вкладки «Сегодня» / «Настройки», кнопка «+».

import { getSettings } from "./store.js";
import { h, clear, closeAllSheets } from "./ui/dom.js";
import { renderToday } from "./ui/today.js";
import { renderSettings } from "./ui/settings.js";
import { renderOnboarding } from "./ui/onboarding.js";
import { openAddSheet } from "./ui/add-sheet.js";
import { getCurrentDate, setCurrentDate, toDateStr } from "./ui/state.js";

const main = document.getElementById("main");
const tabbar = document.getElementById("tabbar");
let tab = "today";

function renderTabbar() {
  const item = (id, icon, label) => h("button.tab" + (tab === id ? ".active" : ""), {
    type: "button", "aria-current": tab === id ? "page" : null, onclick: () => switchTab(id),
  }, h("span.tab-icon", { "aria-hidden": "true" }, icon), h("span.tab-label", label));
  clear(tabbar).append(
    item("today", "◔", "Сегодня"),
    h("button.fab", { type: "button", "aria-label": "Добавить еду", onclick: () => openAddSheet({ date: getCurrentDate() }) }, "+"),
    item("settings", "⚙︎", "Настройки"),
  );
}

async function render() {
  if (tab === "settings") await renderSettings(main);
  else await renderToday(main);
}

function switchTab(id) {
  tab = id;
  renderTabbar();
  window.scrollTo(0, 0);
  render();
}

window.addEventListener("kbju:changed", (e) => {
  if (tab === "today" || e.detail?.what === "all") render();
});

// Вернулись в приложение на следующий день — показать новый «Сегодня».
let lastToday = toDateStr();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const now = toDateStr();
  if (now !== lastToday) {
    if (getCurrentDate() === lastToday) setCurrentDate(now);
    lastToday = now;
    if (tab === "today") render();
  }
});

async function start() {
  const settings = await getSettings();
  if (!settings.profile || !settings.goal) {
    tabbar.hidden = true;
    await renderOnboarding(main);
    tabbar.hidden = false;
  }
  closeAllSheets();
  renderTabbar();
  await render();
}

start().catch((err) => {
  console.error(err);
  clear(main).append(h("div.fatal",
    h("h1", "Не получилось запуститься"),
    h("p", "Похоже, браузер не даёт хранить данные (например, в приватном режиме). Открой приложение в обычном режиме Safari."),
  ));
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => console.warn("SW:", err));
  });
}
