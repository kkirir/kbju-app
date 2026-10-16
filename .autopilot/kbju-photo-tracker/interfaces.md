# Что уже построено

Читается каждым исполнителем до начала работы. Не изобретай заново то, что здесь есть.

## Границы, решённые в спецификации

| Модуль | Файл | Владеет | Выставляет |
|---|---|---|---|
| `nutrition` | `src/nutrition.js` | вся арифметика КБЖУ | `scale(per100, grams) -> Macros`, `sumMacros(list) -> Macros`, `normalizeLabel(labelResult) -> { per100\|null, perPortion\|null, unit: "g"\|"ml", suggestions: number[] }`, `calcGoal(profile) -> Macros`, `mealByHour(hour) -> "breakfast"\|"lunch"\|"dinner"\|"snack"`, `round(macros) -> Macros` |
| `ai` | `src/ai.js` | разговор с Claude | `analyzeFood(img, hint, cfg)`, `readLabel(img, cfg)`, `readBarcode(img, cfg)`, `checkKey(cfg)`; `img = { base64, mediaType }`; `cfg = { apiKey, model, fetch? }`; кидает `AiError` с полем `kind`: `no-key`\|`bad-key`\|`rate`\|`network`\|`bad-response` |
| `foodfacts` | `src/foodfacts.js` | Open Food Facts | `lookupBarcode(code, fetchImpl?) -> { name, per100, servingGrams\|null, packageGrams\|null } \| null` |
| `store` | `src/store.js` | IndexedDB | `listEntries(date)`, `saveEntry(e)`, `deleteEntry(id)`, `listProducts(query)`, `upsertProduct(p)`, `getSettings()`, `saveSettings(s)`, `exportAll() -> json`, `importAll(json)` |
| `image` | `src/image.js` | подготовка фото | `prepareImage(file) -> Promise<{ base64, mediaType }>` |
| `ui` | `src/ui/*`, `src/app.js` | экраны | `openReview(ctx)` в `src/ui/review.js` (таск 01), `openCapture(mode, ctx)` в `src/ui/capture.js` (заглушка — таск 01, реализация — таск 03); `mode`: `"food"`\|`"label"`\|`"barcode"` |

```ts
type Macros = { kcal: number; protein: number; fat: number; carbs: number };
type Entry = { id: string; date: string /* YYYY-MM-DD local */; meal: "breakfast"|"lunch"|"dinner"|"snack";
  name: string; grams: number|null; kcal: number; protein: number; fat: number; carbs: number;
  per100: Macros|null; portions?: { count: number; perPortion: Macros };
  source: "photo"|"label"|"barcode"|"recent"|"manual"; createdAt: number };
// readLabel ok-результат (сырой, без нормализации):
type LabelResult = { ok: true; name: string|null; basis: "100g"|"100ml"|"portion";
  per: Macros /* kcal может быть в кДж */; energyUnit: "kcal"|"kJ";
  portionGrams: number|null; packageGrams: number|null } | { ok: false; reason: string };
type FoodResult = { ok: true; items: Array<{ name: string; grams: number } & Macros> } | { ok: false; reason: string };
type BarcodeResult = { ok: true; code: string } | { ok: false; reason: string };
```

Швы для тестов: `nutrition` (чистые функции), `ai` и `foodfacts` с подставным `fetch`.

## Общие правила проекта

- Стек: статические HTML/CSS/JS, ES-модули, **без сборки и без npm-зависимостей**. Ничего не устанавливай. Не хватает зависимости → верни `BLOCKED` с названием.
- Модули `nutrition`, `ai`, `foodfacts` не трогают DOM и `window` — их импортирует Node в тестах.
- Тесты: `node --test tests/` из корня проекта; один файл — `node --test tests/<file>.test.js`.
- Локальный запуск: `python3 -m http.server 8000` из корня → http://localhost:8000
- Корень проекта: `/Users/kkirir/kbju-app`. Папку `.autopilot/` и `CLAUDE.md` не трогай.
- Весь текст интерфейса и сообщений — по-русски.
- Ключ API — только в `settings` в IndexedDB, вводится пользователем. Никаких ключей в коде, логах, тестах (в тестах — фиктивная строка `test-key`).

## Из таска 02 — распознавание

- `ai.js`: `analyzeFood(img, hint, cfg) -> FoodResult`, `readLabel(img, cfg) -> LabelResult` (числа уже числа, запятая разобрана), `readBarcode(img, cfg) -> BarcodeResult`, `checkKey(cfg) -> boolean` (false при 401/403, иначе бросает AiError), `DEFAULT_MODEL = "claude-sonnet-5-5"`
- `class AiError { kind, status, detail, message }` — `message` уже по-русски, его можно показывать пользователю. 5xx → `rate`, прочие 4xx → `bad-response`
- `foodfacts.js`: `lookupBarcode(code, fetchImpl?)` → объект | `null` (не найдено); при сбое сети/5xx **бросает** Error с `kind: "network"` — UI должен отличать «нет в базе» от «нет связи». Без названия → «Продукт <код>»
- `image.js`: `prepareImage(file) -> Promise<{ base64, mediaType: "image/jpeg" }>`
- Тесты: `node --test` из корня (не `node --test tests/` — на Node 26 падает)
- Общий разбор чисел: `parseNumber(v) -> number|null` («12,5», «1 046») и `parseMass(v) -> number|null` (0/отриц./нечисло → null) живут в `src/foodfacts.js`, их импортирует `ai.js`. Не пиши свои.
