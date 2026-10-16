// Общее состояние интерфейса: выбранный день и сигнал «данные изменились».

export function toDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateStr, n) {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

/** «Сегодня» / «Вчера» / «пн, 12 октября» */
export function dayLabel(dateStr) {
  const today = toDateStr();
  if (dateStr === today) return "Сегодня";
  if (dateStr === addDays(today, -1)) return "Вчера";
  const d = parseDateStr(dateStr);
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : "";
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

let currentDate = toDateStr();
export const getCurrentDate = () => currentDate;
export function setCurrentDate(dateStr) {
  const today = toDateStr();
  currentDate = dateStr > today ? today : dateStr;
  return currentDate;
}

/** Оповестить экраны, что записи/продукты/настройки изменились. */
export function notifyChanged(what = "data") {
  window.dispatchEvent(new CustomEvent("kbju:changed", { detail: { what } }));
}
