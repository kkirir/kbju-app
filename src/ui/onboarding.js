// Первый запуск: анкета → расчёт нормы → можно поправить → «Начать».

import { saveSettings } from "../store.js";
import { calcGoal } from "../nutrition.js";
import { h, clear, toast } from "./dom.js";
import { profileForm, goalFields, profileComplete } from "./profile.js";

/** Рисует анкету в root. Возвращает Promise, который выполняется после сохранения. */
export function renderOnboarding(root) {
  return new Promise((resolve) => {
    let profile = null;
    const form = profileForm(null, (p) => { profile = p; });
    profile = form.get();

    const stepProfile = () => {
      const next = h("button.btn.btn-primary.btn-block", { type: "button" }, "Рассчитать норму");
      next.addEventListener("click", () => {
        if (!profileComplete(profile)) return toast("Заполни возраст, рост и вес");
        stepGoal();
      });
      clear(root).append(h("div.onboarding",
        h("h1.onb-title", "Привет!"),
        h("p.onb-text", "Расскажи о себе — посчитаю дневную норму калорий, белков, жиров и углеводов."),
        form.el,
        next,
      ));
    };

    const stepGoal = () => {
      const calculated = calcGoal(profile);
      let manual = false;
      const goal = goalFields(calculated, () => { manual = true; });
      const back = h("button.btn.btn-secondary", { type: "button", onclick: stepProfile }, "Назад");
      const start = h("button.btn.btn-primary", { type: "button" }, "Начать");
      start.addEventListener("click", async () => {
        start.disabled = true;
        await saveSettings({ profile, goal: goal.get(), goalManual: manual });
        resolve();
      });
      clear(root).append(h("div.onboarding",
        h("h1.onb-title", "Твоя норма на день"),
        h("p.onb-text", "Посчитано по формуле Миффлина — Сан-Жеора с учётом активности и цели. Любую цифру можно поправить — сейчас или потом в настройках."),
        goal.el,
        h("div.btn-row", back, start),
      ));
    };

    stepProfile();
  });
}
