<!-- autopilot:start -->
# КБЖУ по фото

PWA для телефона: считает калории, белки, жиры и углеводы по фото еды, этикетки или штрихкода; статический HTML/CSS/JS на ES-модулях, без сборки и npm-зависимостей.

## Команды

- Запуск: `python3 -m http.server 8000` из корня → http://localhost:8000
- Тесты: `node --test` из корня (36 тестов); один файл — `node --test tests/<file>.test.js`; то же `npm test`
- Иконки: `node tools/make-icons.mjs` из корня — перезаписывает `icons/*.png` (пишет в `icons/` относительно cwd)

## Структура

```
index.html, styles.css, manifest.webmanifest   оболочка PWA
sw.js                                          service worker, кэш оболочки
src/app.js                                     точка входа: онбординг, вкладки, «+», регистрация SW
src/nutrition.js                               вся арифметика КБЖУ и разбор чисел (чистые функции)
src/ai.js                                      Claude Messages API из браузера
src/foodfacts.js                               Open Food Facts по штрихкоду
src/store.js                                   IndexedDB: записи, продукты, настройки, экспорт/импорт
src/image.js                                   сжатие фото в JPEG base64
src/ui/                                        экраны и листы (dom.js, state.js — общие хелперы)
tests/                                         node:test для nutrition, ai, foodfacts
tools/make-icons.mjs                           генератор PNG-иконок на node:zlib
```

## Ключевые файлы

- `src/nutrition.js` — `scale(per100, grams)`, `sumMacros(list)`, `normalizeLabel(label) -> {per100|null, perPortion|null, unit, suggestions}`, `calcGoal({sex:"male"|"female", age, height, weight, activity:1.2…1.9, goal:"lose"|"keep"|"gain"})`, `mealByHour(h) -> "breakfast"|"lunch"|"dinner"|"snack"`, `round(m)` (ккал до целых, г до 0.1), `toPer100(m, grams)`, `times(m, k)`, `parseNumber(v)`, `parseMass(v)`, `KJ_PER_KCAL = 4.184`
- `src/ai.js` — `analyzeFood(img, hint, cfg) -> FoodResult`, `readLabel(img, cfg) -> LabelResult`, `readBarcode(img, cfg) -> BarcodeResult`, `checkKey(cfg) -> boolean`, `DEFAULT_MODEL = "claude-sonnet-5-5"`, `class AiError`; `img = {base64, mediaType}`, `cfg = {apiKey, model, fetch?}`
- `src/foodfacts.js` — `lookupBarcode(code, fetchImpl?) -> {name, per100, servingGrams|null, packageGrams|null} | null`
- `src/store.js` — `listEntries(date)`, `saveEntry(e) -> Entry` (ставит id, createdAt, unit="g"), `deleteEntry(id)`, `listProducts(query)`, `upsertProduct({name, per100, perPortion, unit, suggestions, lastGrams, lastCount, source})`, `getSettings() -> {apiKey, model, profile, goal, goalManual}`, `saveSettings(patch)` (merge), `exportAll() -> json`, `importAll(json|obj) -> Promise<{entries, products}>`, `productKey(name)`
- `src/image.js` — `prepareImage(file) -> Promise<{base64, mediaType: "image/jpeg"}>` (длинная сторона ≤1568, качество 0.85)
- `src/ui/review.js` — `openReview(ctx) -> Promise<Entry[]|null>`, `openEntryEditor(entry)`, `macroLine(m)`
- `src/ui/capture.js` — `openCapture(mode, ctx)`, `mode: "food"|"label"|"barcode"`, `ctx = {date, meal?}`
- `src/ui/dom.js` — `h("tag.class", props, ...children)`, `clear`, `openSheet`, `closeAllSheets`, `confirmDialog`, `toast`, `numberField`, `textField`, `segmented`, `fmt`, `MEALS`, `mealLabel`
- `src/ui/state.js` — текущая дата (`getCurrentDate`/`setCurrentDate`), `toDateStr`, `addDays`, `dayLabel`, `notifyChanged(what)`

Типы:

```ts
type Macros = { kcal: number; protein: number; fat: number; carbs: number };
type Entry = { id: string; date: string /* YYYY-MM-DD local */; meal: "breakfast"|"lunch"|"dinner"|"snack";
  name: string; grams: number|null; kcal: number; protein: number; fat: number; carbs: number;
  per100: Macros|null; portions?: { count: number; perPortion: Macros };
  unit: "g"|"ml" /* по умолчанию "g" */;
  source: "photo"|"label"|"barcode"|"recent"|"manual"; createdAt: number };
type LabelResult = { ok: true; name: string|null; basis: "100g"|"100ml"|"portion";
  per: Macros /* kcal может быть в кДж */; energyUnit: "kcal"|"kJ";
  portionGrams: number|null; packageGrams: number|null } | { ok: false; reason: string }; // сырой, без нормализации; числа уже числа
type FoodResult = { ok: true; items: Array<{ name: string; grams: number } & Macros> } | { ok: false; reason: string };
type BarcodeResult = { ok: true; code: string } | { ok: false; reason: string };
```

## Архитектура

- `index.html` → `src/app.js`: нет `profile`/`goal` в настройках → `renderOnboarding`; иначе вкладки `renderToday` / `renderSettings` и кнопка «+» → `openAddSheet`.
- `add-sheet.js` → `openRecent` / `openManual` / `openCapture` (capture импортируется динамически).
- `openCapture`: `prepareImage` → `ai.*`; food → `openReview({kind:"items", items, source:"photo"})`; label → `openReview({kind:"product", ...normalizeLabel(res), source:"label"})`; barcode → `readBarcode` → `lookupBarcode` → `openReview({kind:"product", per100, perPortion, suggestions:[serving, package], unit:"g", source:"barcode"})`.
- `openReview(ctx)`: ctx = `{kind:"items", items, source}` | `{kind:"product", name, per100|null, perPortion|null, unit, suggestions, source, defaultGrams?, defaultCount?}`, плюс необязательные `date`, `meal`, `title`; сам вызывает `saveEntry` + `upsertProduct` («Недавние») и шлёт `kbju:changed`.
- События на `window`: `"kbju:changed"` `{detail:{what}}` — перерисовка «Сегодня» (`what:"all"` — любой вкладки); `"kbju:navigate"` `{detail:{tab:"today"|"settings"}}` — закрывает листы и переключает вкладку (слушатели в `src/app.js`).
- IndexedDB `kbju` v1: сторы `entries` (keyPath `id`), `products` (keyPath `key` = `productKey(name)`), `settings` (keyPath `id`, одна запись).
- Внешние вызовы только два: `https://api.anthropic.com/v1/messages` (`src/ai.js`) и `https://world.openfoodfacts.org/api/v2/product/<code>.json` (`src/foodfacts.js`); SW их не трогает.
- Граница: `nutrition`, `ai`, `foodfacts` не трогают DOM и `window` — их импортирует Node в тестах; DOM только в `src/ui/*` и `src/app.js`.
- `ai.js`: один инструмент на режим (`report_food`, `report_label`, `report_barcode`) со `strict: true`; ответ берётся из блока `tool_use`, нет блока → `AiError("bad-response")`.
- D01: модели из `NO_FORCED_TOOL` (`claude-sonnet-5-5`, `claude-opus-5-5`, `claude-fable-5-1`, `claude-mythos-5-1`) отвечают 400 на принудительный `tool_choice`, для них `{type:"auto", disable_parallel_tool_use:true}` + strict-схема + требование в промпте; для остальных — `{type:"tool", name}`.
- `AiError { kind, status, detail, message }`: `kind` ∈ `no-key|bad-key|rate|network|bad-response`; `message` уже по-русски, его показывают пользователю; 401/403 → `bad-key`, 429/529/5xx → `rate`, прочие 4xx → `bad-response`; `checkKey` возвращает false при 401/403, иначе бросает.
- `lookupBarcode`: не найдено → `null`; сбой сети/5xx → бросает Error с `kind:"network"` (UI различает «нет в базе» и «нет связи»); без названия → «Продукт <код>».
- `importAll` сначала проверяет весь файл, при ошибке бросает Error («Файл не загружен, данные не тронуты…») и ничего не пишет.

## Соглашения кода

- Весь текст интерфейса, сообщений об ошибках и комментариев — по-русски.
- Разбор чисел — только `parseNumber`/`parseMass`/`KJ_PER_KCAL` из `src/nutrition.js`; `DEFAULT_MODEL` — только из `src/ai.js`; своих не писать.
- Арифметика КБЖУ — только в `src/nutrition.js`; DOM-хелперы — из `src/ui/dom.js`, состояние UI — из `src/ui/state.js`.
- Без npm-зависимостей и сборки; Node-скрипты — только на встроенных модулях (`node:zlib`, `node:fs`).
- Сеть в `ai`/`foodfacts` — через инжектируемый `fetch` (`cfg.fetch`, `fetchImpl`) для тестов.

## Окружение

- Ключ Claude API вводит пользователь в «Настройках»; хранится в `settings` в IndexedDB; `exportAll()` его выкидывает. В коде, логах и тестах ключей нет (в тестах — фиктивная строка `test-key`).
- Модель по умолчанию `DEFAULT_MODEL`, переопределяется `settings.model`.
- Переменных окружения нет.

## Тесты

- `tests/nutrition.test.js` — чистые функции; `tests/ai.test.js` и `tests/foodfacts.test.js` — с подставным `fakeFetch`, без сети.
- UI, `store` и `image` автотестами не покрыты (нужен браузер).

## Подводные камни

- `node --test tests/` падает на Node 26 (папка воспринимается как файл) — запускать `node --test` без аргумента.
- Изменил любой файл оболочки или добавил файл в `src/` → добавить в `CORE` в `sw.js` и поднять версию `CACHE` (сейчас `kbju-shell-v2`); иначе офлайн отдаётся старое, а отсутствующий в `CORE` файл не работает без сети.
- SW не регистрируется в панели браузера Claude — офлайн-поведение там не проверить.
- Запрос к Anthropic из браузера требует заголовка `anthropic-dangerous-direct-browser-access: true` (вместе с `x-api-key`, `anthropic-version: 2023-06-01`).
- `node tools/make-icons.mjs`, запущенный не из корня, создаст `icons/` в текущей папке.

## Как здесь работает Autopilot

Сборка ведётся навыком `/autopilot`. Требования, спецификация и таски — в `.autopilot/`.
Прогресс — `.autopilot/dashboard.html`. Правило: требование из `manifest.md`
может снять только пользователь.

Если работа продолжается — скажи «продолжи автопилот»: состояние поднимется
из `.autopilot/state.js`, переспрашивать ничего не нужно.
<!-- autopilot:end -->
