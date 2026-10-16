// Разговор с Claude (Anthropic Messages API) прямо из браузера.
// Модуль не трогает DOM и window: его импортируют Node-тесты.

import { parseNumber, parseMass } from "./nutrition.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
export const DEFAULT_MODEL = "claude-sonnet-5-5";

// Эти модели отвечают 400 на принудительный tool_choice ("tool"/"any"),
// для них — "auto" + строгая схема + явное требование в промпте.
const NO_FORCED_TOOL = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1", "claude-mythos-5-1"]);

const MESSAGES = {
  "no-key": "Нет ключа Claude API. Вставь его в «Настройках».",
  "bad-key": "Ключ не подошёл. Проверь его в «Настройках».",
  rate: "Сервис перегружен или превышен лимит запросов. Подожди немного и нажми «Повторить».",
  network: "Нет связи с сервером. Проверь интернет и нажми «Повторить».",
  "bad-response": "Не удалось разобрать ответ ИИ. Попробуй ещё раз.",
};

export class AiError extends Error {
  constructor(kind, detail, status = null) {
    super(MESSAGES[kind] || detail || kind);
    this.name = "AiError";
    this.kind = kind;
    this.status = status;
    this.detail = detail || null;
  }
}

// ---------- промпты и схемы ----------

const SYSTEM_BASE =
  "Ты помощник приложения для подсчёта КБЖУ (калории, белки, жиры, углеводы). " +
  "Пользователь присылает фото с телефона. Отвечай только вызовом инструмента, без текста. " +
  "Все названия и причины пиши по-русски. Числа — обычными числами с точкой как десятичным разделителем.";

const FOOD_PROMPT = `Это фото еды. Определи каждое блюдо или продукт на фото отдельной позицией.
Для каждой позиции:
- name — короткое понятное название по-русски («Гречка отварная», «Куриная грудка жареная», «Хлеб ржаной»);
- grams — реалистичная оценка массы именно той порции, что на фото: ориентируйся на размер тарелки (обычная обеденная ~25 см), ложки, вилки, ладони, упаковки; не завышай и не занижай;
- kcal, protein, fat, carbs — на всю эту порцию (не на 100 г), учитывая способ приготовления (жарка в масле, соус, заправка).
Если пользователь дал уточнение, оно важнее твоей оценки по фото (количество штук, способ приготовления, масса).
Если на фото нет еды или ничего нельзя разобрать — ok=false и в reason коротко, что не так («На фото не видно еды», «Фото слишком тёмное»).
Обязательно вызови инструмент report_food.`;

const LABEL_PROMPT = `Это фото упаковки продукта с таблицей пищевой ценности (на русских этикетках: «Пищевая ценность», «Энергетическая ценность», «в 100 г продукта», «на 100 мл»).
Твоя задача — ПЕРЕПИСАТЬ числа из таблицы ровно как напечатано. НЕ оценивай, НЕ пересчитывай, НЕ округляй и НЕ подставляй типовые значения для такого продукта.
Правила:
- Если есть колонка «на 100 г» или «на 100 мл» — бери её, даже если рядом есть колонка «на порцию». basis = "100g" или "100ml" (жидкости — 100 мл).
- Только если значения даны лишь на порцию/штуку — basis = "portion", и тогда в portionGrams укажи массу порции в граммах, если она написана («порция 30 г»), иначе null.
- Энергия: если указаны и ккал, и кДж — бери ккал, energyUnit = "kcal". Если только кДж — перепиши число в кДж, energyUnit = "kJ" (сам не переводи).
- На этикетках запятая — десятичный разделитель: «12,5 г» → 12.5. Пиши числа с точкой.
- protein — белки, fat — жиры, carbs — углеводы, в граммах. Если строки нет или стоит прочерк — 0.
- packageGrams — масса нетто или объём упаковки («масса нетто 450 г», «0,9 л» → 900), если видно, иначе null; portionGrams — масса порции, если указана, иначе null.
- name — название продукта по-русски, если оно видно на фото, иначе null.
Если таблица не читается (блик, размыто, обрезано, на фото не этикетка) — ok=false и в reason коротко и конкретно, что не так и как переснять («Таблица обрезана снизу — сфоткай целиком», «Блик на цифрах»). Не угадывай нечитаемые цифры.
Обязательно вызови инструмент report_label.`;

const BARCODE_PROMPT = `Это фото штрих-кода. Перепиши цифры под штрихами (EAN-13, EAN-8, UPC — обычно 8–14 цифр) без пробелов.
Если штрих-кода нет или цифры не читаются — ok=false и в reason коротко, что не так («Цифры под штрих-кодом размыты»). Не угадывай цифры.
Обязательно вызови инструмент report_barcode.`;

const num = { type: "number" };
const numOrNull = { type: ["number", "null"] };
const strOrNull = { type: ["string", "null"] };

function schema(properties) {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

const TOOLS = {
  food: {
    name: "report_food",
    description: "Сообщить распознанные позиции еды с массой и КБЖУ на порцию, либо причину, почему распознать нельзя.",
    strict: true,
    input_schema: schema({
      ok: { type: "boolean", description: "true, если на фото есть еда и её удалось оценить" },
      reason: { ...strOrNull, description: "при ok=false — что не так, по-русски; иначе null" },
      items: {
        type: "array",
        description: "позиции; при ok=false — пустой массив",
        items: schema({
          name: { type: "string", description: "название по-русски" },
          grams: { ...num, description: "оценка массы порции, г" },
          kcal: { ...num, description: "ккал на порцию" },
          protein: { ...num, description: "белки на порцию, г" },
          fat: { ...num, description: "жиры на порцию, г" },
          carbs: { ...num, description: "углеводы на порцию, г" },
        }),
      },
    }),
  },
  label: {
    name: "report_label",
    description: "Переписать значения из таблицы пищевой ценности как напечатано, либо сообщить, почему таблицу не прочитать.",
    strict: true,
    input_schema: schema({
      ok: { type: "boolean", description: "true, если таблица прочитана" },
      reason: { ...strOrNull, description: "при ok=false — что не так, по-русски; иначе null" },
      name: { ...strOrNull, description: "название продукта, если видно" },
      basis: { type: "string", enum: ["100g", "100ml", "portion"], description: "на что даны значения" },
      energyUnit: { type: "string", enum: ["kcal", "kJ"], description: "в чём записана энергия" },
      kcal: { ...num, description: "энергия как напечатано (в energyUnit)" },
      protein: { ...num, description: "белки, г" },
      fat: { ...num, description: "жиры, г" },
      carbs: { ...num, description: "углеводы, г" },
      portionGrams: { ...numOrNull, description: "масса порции, г, если указана" },
      packageGrams: { ...numOrNull, description: "масса/объём упаковки, г или мл, если указаны" },
    }),
  },
  barcode: {
    name: "report_barcode",
    description: "Сообщить цифры штрих-кода, либо почему их не прочитать.",
    strict: true,
    input_schema: schema({
      ok: { type: "boolean" },
      reason: { ...strOrNull, description: "при ok=false — что не так, по-русски; иначе null" },
      code: { ...strOrNull, description: "цифры штрих-кода без пробелов" },
    }),
  },
};

// ---------- HTTP ----------

function getFetch(cfg) {
  if (cfg && typeof cfg.fetch === "function") return cfg.fetch;
  return (...args) => globalThis.fetch(...args);
}

function requireKey(cfg) {
  const key = cfg && typeof cfg.apiKey === "string" ? cfg.apiKey.trim() : "";
  if (!key) throw new AiError("no-key");
  return key;
}

function kindForStatus(status) {
  if (status === 401 || status === 403) return "bad-key";
  if (status === 429 || status === 529 || status >= 500) return "rate";
  return "bad-response";
}

async function post(cfg, body) {
  const key = requireKey(cfg);
  let res;
  try {
    res = await getFetch(cfg)(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": API_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new AiError("network", e && e.message);
  }
  if (!res.ok) {
    let detail = null;
    try {
      const err = await res.json();
      detail = err && err.error && err.error.message;
    } catch {
      detail = null; // тело ошибки не JSON — достаточно статуса
    }
    throw new AiError(kindForStatus(res.status), detail, res.status);
  }
  try {
    return await res.json();
  } catch (e) {
    throw new AiError("bad-response", "ответ не JSON");
  }
}

function modelOf(cfg) {
  return (cfg && cfg.model) || DEFAULT_MODEL;
}

async function callTool(mode, img, prompt, cfg) {
  if (!img || !img.base64 || !img.mediaType) throw new TypeError("img = { base64, mediaType } обязателен");
  const tool = TOOLS[mode];
  const model = modelOf(cfg);
  const toolChoice = NO_FORCED_TOOL.has(model)
    ? { type: "auto", disable_parallel_tool_use: true }
    : { type: "tool", name: tool.name, disable_parallel_tool_use: true };
  const data = await post(cfg, {
    model,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    system: SYSTEM_BASE,
    tools: [tool],
    tool_choice: toolChoice,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });
  const block = Array.isArray(data && data.content)
    ? data.content.find((b) => b && b.type === "tool_use" && b.name === tool.name)
    : null;
  if (!block || !block.input || typeof block.input !== "object") {
    const why = data && data.stop_reason === "refusal" ? "модель отказалась отвечать" : "нет вызова инструмента";
    throw new AiError("bad-response", why);
  }
  return block.input;
}

// ---------- разбор ----------

// Разбор чисел и масс — общий на проект (parseNumber / parseMass из nutrition).
function needNum(v, field) {
  const n = parseNumber(v);
  if (n === null || n < 0) throw new AiError("bad-response", `поле ${field}: ${JSON.stringify(v)}`);
  return n;
}

function notOk(input, fallback) {
  const reason = typeof input.reason === "string" && input.reason.trim() ? input.reason.trim() : fallback;
  return { ok: false, reason };
}

// ---------- публичный интерфейс ----------

export async function analyzeFood(img, hint, cfg) {
  const extra = typeof hint === "string" && hint.trim() ? `\n\nУточнение от пользователя: ${hint.trim()}` : "";
  const input = await callTool("food", img, FOOD_PROMPT + extra, cfg);
  if (input.ok !== true) return notOk(input, "Не вижу на фото еды — попробуй ещё раз");
  if (!Array.isArray(input.items)) throw new AiError("bad-response", "нет items");
  const items = input.items.map((it, i) => {
    if (!it || typeof it.name !== "string" || !it.name.trim()) throw new AiError("bad-response", `items[${i}].name`);
    return {
      name: it.name.trim(),
      grams: needNum(it.grams, "grams"),
      kcal: needNum(it.kcal, "kcal"),
      protein: needNum(it.protein, "protein"),
      fat: needNum(it.fat, "fat"),
      carbs: needNum(it.carbs, "carbs"),
    };
  });
  if (items.length === 0) return { ok: false, reason: "Не вижу на фото еды — попробуй ещё раз" };
  return { ok: true, items };
}

export async function readLabel(img, cfg) {
  const input = await callTool("label", img, LABEL_PROMPT, cfg);
  if (input.ok !== true) return notOk(input, "Не удалось прочитать таблицу — пересними этикетку");
  if (!["100g", "100ml", "portion"].includes(input.basis)) throw new AiError("bad-response", "basis");
  if (!["kcal", "kJ"].includes(input.energyUnit)) throw new AiError("bad-response", "energyUnit");
  return {
    ok: true,
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : null,
    basis: input.basis,
    per: {
      kcal: needNum(input.kcal, "kcal"),
      protein: needNum(input.protein, "protein"),
      fat: needNum(input.fat, "fat"),
      carbs: needNum(input.carbs, "carbs"),
    },
    energyUnit: input.energyUnit,
    portionGrams: parseMass(input.portionGrams),
    packageGrams: parseMass(input.packageGrams),
  };
}

export async function readBarcode(img, cfg) {
  const input = await callTool("barcode", img, BARCODE_PROMPT, cfg);
  const fallback = "Не удалось прочитать цифры штрих-кода — сфоткай ближе и ровнее";
  if (input.ok !== true) return notOk(input, fallback);
  const code = typeof input.code === "string" ? input.code.replace(/[\s-]/g, "") : "";
  if (!/^\d{8,14}$/.test(code)) return { ok: false, reason: fallback };
  return { ok: true, code };
}

// Дешёвая проверка ключа: крошечный запрос. true — ключ рабочий, false — 401/403.
// Прочие сбои (сеть, перегрузка) — AiError, чтобы не выдавать их за плохой ключ.
export async function checkKey(cfg) {
  try {
    await post(cfg, {
      model: modelOf(cfg),
      max_tokens: 16,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "Ответь: ок" }],
    });
    return true;
  } catch (e) {
    if (e instanceof AiError && e.kind === "bad-key") return false;
    throw e;
  }
}
