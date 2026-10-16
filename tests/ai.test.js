import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeFood, readLabel, readBarcode, checkKey, AiError } from "../src/ai.js";

const IMG = { base64: "AAAA", mediaType: "image/jpeg" };

// Подставной fetch: запоминает запрос, отвечает заданным телом/статусом.
function fakeFetch(respond) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init && init.body ? JSON.parse(init.body) : null });
    return respond(calls.length);
  };
  fn.calls = calls;
  return fn;
}
const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});
// Ответ Messages API, где модель вызвала инструмент с данным input.
const toolReply = (name, input) =>
  jsonResponse(200, {
    type: "message",
    role: "assistant",
    stop_reason: "tool_use",
    content: [
      { type: "thinking", thinking: "", signature: "x" },
      { type: "tool_use", id: "toolu_1", name, input },
    ],
  });
const cfg = (fetch, extra = {}) => ({ apiKey: "test-key", model: "claude-sonnet-5-5", fetch, ...extra });

test("analyzeFood: запрос к Messages API с ключом, картинкой и инструментом; возвращает позиции", async () => {
  const items = [
    { name: "Гречка отварная", grams: 180, kcal: 198, protein: 7.2, fat: 1.8, carbs: 38 },
    { name: "Куриная грудка", grams: 120, kcal: 198, protein: 37, fat: 4.3, carbs: 0 },
  ];
  const fetch = fakeFetch(() => toolReply("report_food", { ok: true, reason: null, items }));
  const res = await analyzeFood(IMG, "", cfg(fetch));

  assert.deepEqual(res, { ok: true, items });
  assert.equal(fetch.calls.length, 1);
  const { url, init, body } = fetch.calls[0];
  assert.equal(url, "https://api.anthropic.com/v1/messages");
  assert.equal(init.method, "POST");
  assert.equal(init.headers["x-api-key"], "test-key");
  assert.equal(init.headers["anthropic-version"], "2023-06-01");
  assert.equal(init.headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.equal(body.model, "claude-sonnet-5-5");
  const image = body.messages[0].content.find((b) => b.type === "image");
  assert.deepEqual(image.source, { type: "base64", media_type: "image/jpeg", data: "AAAA" });
  assert.equal(body.tools.length, 1);
  assert.equal(body.tools[0].name, "report_food");
});

test("analyzeFood: уточнение пользователя уходит в запрос", async () => {
  const fetch = fakeFetch(() =>
    toolReply("report_food", { ok: true, reason: null, items: [{ name: "Яичница", grams: 110, kcal: 160, protein: 14, fat: 11, carbs: 1 }] })
  );
  await analyzeFood(IMG, "2 яйца, жарил без масла", cfg(fetch));
  const text = JSON.stringify(fetch.calls[0].body.messages);
  assert.ok(text.includes("2 яйца, жарил без масла"));
});

test("analyzeFood: не еда → { ok:false, reason } с причиной от модели", async () => {
  const fetch = fakeFetch(() => toolReply("report_food", { ok: false, reason: "На фото не видно еды", items: [] }));
  const res = await analyzeFood(IMG, "", cfg(fetch));
  assert.deepEqual(res, { ok: false, reason: "На фото не видно еды" });
});

test("readLabel: значения на 100 г возвращаются как есть, ровно по полям §3", async () => {
  // Творог 5 %: «в 100 г продукта: белки 16,0 г, жиры 5,0 г, углеводы 3,0 г; 121 ккал», масса нетто 200 г
  const fetch = fakeFetch(() =>
    toolReply("report_label", {
      ok: true, reason: null, name: "Творог 5%", basis: "100g", energyUnit: "kcal",
      kcal: 121, protein: 16, fat: 5, carbs: 3, portionGrams: null, packageGrams: 200,
    })
  );
  const res = await readLabel(IMG, cfg(fetch));
  assert.deepEqual(res, {
    ok: true, name: "Творог 5%", basis: "100g",
    per: { kcal: 121, protein: 16, fat: 5, carbs: 3 },
    energyUnit: "kcal", portionGrams: null, packageGrams: 200,
  });
  assert.equal(fetch.calls[0].body.tools[0].name, "report_label");
});

test("readLabel: только кДж и только на порцию — без пересчёта; запятая в числе понимается как десятичный разделитель", async () => {
  const fetch = fakeFetch(() =>
    toolReply("report_label", {
      ok: true, reason: null, name: null, basis: "portion", energyUnit: "kJ",
      kcal: 1046, protein: "12,5", fat: 8, carbs: "30,2", portionGrams: 30, packageGrams: null,
    })
  );
  const res = await readLabel(IMG, cfg(fetch));
  assert.deepEqual(res, {
    ok: true, name: null, basis: "portion",
    per: { kcal: 1046, protein: 12.5, fat: 8, carbs: 30.2 },
    energyUnit: "kJ", portionGrams: 30, packageGrams: null,
  });
});

test("readLabel: таблица не читается → причина от модели", async () => {
  const fetch = fakeFetch(() =>
    toolReply("report_label", {
      ok: false, reason: "Таблица обрезана снизу", name: null, basis: "100g", energyUnit: "kcal",
      kcal: 0, protein: 0, fat: 0, carbs: 0, portionGrams: null, packageGrams: null,
    })
  );
  assert.deepEqual(await readLabel(IMG, cfg(fetch)), { ok: false, reason: "Таблица обрезана снизу" });
});

test("readBarcode: возвращает цифры EAN-13 (пробелы между группами убираются)", async () => {
  const fetch = fakeFetch(() => toolReply("report_barcode", { ok: true, reason: null, code: "4 607065 001234" }));
  assert.deepEqual(await readBarcode(IMG, cfg(fetch)), { ok: true, code: "4607065001234" });
});

test("readBarcode: не 8–14 цифр → ok:false", async () => {
  for (const code of ["1234567", "123456789012345", "46070A5001234"]) {
    const fetch = fakeFetch(() => toolReply("report_barcode", { ok: true, reason: null, code }));
    const res = await readBarcode(IMG, cfg(fetch));
    assert.equal(res.ok, false, code);
    assert.equal(typeof res.reason, "string");
    assert.ok(res.reason.length > 0);
  }
});

async function kindOf(promise) {
  try {
    await promise;
  } catch (e) {
    assert.ok(e instanceof AiError, `ожидали AiError, получили ${e}`);
    assert.ok(e.message.length > 0);
    return e.kind;
  }
  assert.fail("ожидали ошибку");
}

test("ошибка no-key: пустой ключ — запрос не отправляется", async () => {
  for (const apiKey of ["", "   ", undefined]) {
    const fetch = fakeFetch(() => assert.fail("не должно быть запроса"));
    assert.equal(await kindOf(analyzeFood(IMG, "", { apiKey, model: "claude-sonnet-5-5", fetch })), "no-key");
    assert.equal(fetch.calls.length, 0);
  }
});

test("ошибка bad-key: 401 и 403", async () => {
  for (const status of [401, 403]) {
    const fetch = fakeFetch(() => jsonResponse(status, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }));
    assert.equal(await kindOf(readLabel(IMG, cfg(fetch))), "bad-key", String(status));
  }
});

test("ошибка rate: 429 и 529", async () => {
  for (const status of [429, 529]) {
    const fetch = fakeFetch(() => jsonResponse(status, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }));
    assert.equal(await kindOf(analyzeFood(IMG, "", cfg(fetch))), "rate", String(status));
  }
});

test("ошибка network: fetch бросил исключение", async () => {
  const fetch = async () => { throw new TypeError("Load failed"); };
  assert.equal(await kindOf(readBarcode(IMG, cfg(fetch))), "network");
});

test("ошибка bad-response: нет tool_use, мусор вместо JSON, неверные поля", async () => {
  const replies = [
    jsonResponse(200, { type: "message", stop_reason: "end_turn", content: [{ type: "text", text: "Это гречка" }] }),
    { ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); }, text: async () => "<html>" },
    toolReply("report_label", { ok: true, reason: null, name: null, basis: "на глаз", energyUnit: "kcal", kcal: 100, protein: 1, fat: 1, carbs: 1, portionGrams: null, packageGrams: null }),
    toolReply("report_label", { ok: true, reason: null, name: null, basis: "100g", energyUnit: "kcal", kcal: "много", protein: 1, fat: 1, carbs: 1, portionGrams: null, packageGrams: null }),
  ];
  for (const [i, reply] of replies.entries()) {
    const fetch = fakeFetch(() => reply);
    assert.equal(await kindOf(readLabel(IMG, cfg(fetch))), "bad-response", `ответ #${i}`);
  }
});

test("модель берётся из cfg.model", async () => {
  const fetch = fakeFetch(() => toolReply("report_barcode", { ok: true, reason: null, code: "46070650" }));
  await readBarcode(IMG, cfg(fetch, { model: "claude-haiku-5-5" }));
  assert.equal(fetch.calls[0].body.model, "claude-haiku-5-5");
});

test("checkKey: 200 → true, 401 → false, перегрузка → AiError rate, без ключа → no-key", async () => {
  const okFetch = fakeFetch(() => jsonResponse(200, { type: "message", stop_reason: "end_turn", content: [{ type: "text", text: "ок" }] }));
  assert.equal(await checkKey(cfg(okFetch)), true);
  assert.equal(okFetch.calls[0].init.headers["x-api-key"], "test-key");
  assert.equal(okFetch.calls[0].url, "https://api.anthropic.com/v1/messages");

  const badFetch = fakeFetch(() => jsonResponse(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }));
  assert.equal(await checkKey(cfg(badFetch)), false);

  const busyFetch = fakeFetch(() => jsonResponse(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }));
  assert.equal(await kindOf(checkKey(cfg(busyFetch))), "rate");

  assert.equal(await kindOf(checkKey({ apiKey: "", model: "claude-sonnet-5-5", fetch: okFetch })), "no-key");
});

test("tool_choice: claude-haiku-5-5 — принудительный инструмент, claude-sonnet-5-5 — auto (spec §3, D01); инструмент strict", async () => {
  const reply = () => toolReply("report_food", { ok: true, reason: null, items: [{ name: "Яблоко", grams: 150, kcal: 78, protein: 0.6, fat: 0.6, carbs: 15 }] });

  const haiku = fakeFetch(reply);
  await analyzeFood(IMG, "", cfg(haiku, { model: "claude-haiku-5-5" }));
  assert.equal(haiku.calls[0].body.tool_choice.type, "tool");
  assert.equal(haiku.calls[0].body.tool_choice.name, "report_food");
  assert.equal(haiku.calls[0].body.tools[0].strict, true);

  const sonnet = fakeFetch(reply);
  await analyzeFood(IMG, "", cfg(sonnet, { model: "claude-sonnet-5-5" }));
  assert.equal(sonnet.calls[0].body.tool_choice.type, "auto");
  assert.equal(sonnet.calls[0].body.tools[0].strict, true);
});

test("HTTP 500/503 → rate, 400/404 → bad-response", async () => {
  const cases = [[500, "rate"], [503, "rate"], [400, "bad-response"], [404, "bad-response"]];
  for (const [status, kind] of cases) {
    const fetch = fakeFetch(() => jsonResponse(status, { type: "error", error: { type: "api_error", message: "boom" } }));
    assert.equal(await kindOf(analyzeFood(IMG, "", cfg(fetch))), kind, String(status));
  }
});

test("ключ не попадает в текст ни одной AiError", async () => {
  const errBody = { type: "error", error: { type: "x", message: "error" } };
  const fetches = [
    async () => { throw new TypeError("Load failed"); },
    ...[400, 401, 403, 404, 429, 500, 503, 529].map((s) => fakeFetch(() => jsonResponse(s, errBody))),
    fakeFetch(() => jsonResponse(200, { type: "message", content: [] })),
    fakeFetch(() => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad"); } })),
  ];
  let seen = 0;
  for (const fetch of fetches) {
    try {
      await readLabel(IMG, cfg(fetch));
      assert.fail("ожидали ошибку");
    } catch (e) {
      assert.ok(e instanceof AiError);
      seen++;
      for (const field of [e.message, e.detail, e.stack]) {
        assert.ok(!String(field ?? "").includes("test-key"), `${e.kind}: ${field}`);
      }
    }
  }
  assert.equal(seen, fetches.length);
});
