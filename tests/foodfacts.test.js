import { test } from "node:test";
import assert from "node:assert/strict";
import { lookupBarcode } from "../src/foodfacts.js";

function fakeFetch(status, body) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  fn.calls = calls;
  return fn;
}

test("lookupBarcode: продукт с ккал — значения на 100 г, порция и упаковка", async () => {
  const fetch = fakeFetch(200, {
    code: "4607065001234",
    status: 1,
    product: {
      product_name: "Kefir 2.5%",
      product_name_ru: "Кефир 2,5%",
      serving_quantity: 250,
      product_quantity: "930",
      nutriments: {
        "energy-kcal_100g": 53, energy_100g: 222,
        proteins_100g: 2.9, fat_100g: 2.5, carbohydrates_100g: 4,
      },
    },
  });
  const res = await lookupBarcode("4607065001234", fetch);
  assert.deepEqual(res, {
    name: "Кефир 2,5%",
    per100: { kcal: 53, protein: 2.9, fat: 2.5, carbs: 4 },
    servingGrams: 250,
    packageGrams: 930,
  });
  assert.equal(
    fetch.calls[0],
    "https://world.openfoodfacts.org/api/v2/product/4607065001234.json?fields=product_name,product_name_ru,nutriments,serving_quantity,product_quantity"
  );
});

test("lookupBarcode: только кДж — ккал = кДж / 4.184", async () => {
  const fetch = fakeFetch(200, {
    status: 1,
    product: {
      product_name: "Хлебцы",
      nutriments: { energy_100g: 1569, proteins_100g: 11, fat_100g: 3, carbohydrates_100g: 70 },
    },
  });
  const res = await lookupBarcode("4600000000017", fetch);
  // 1569 кДж / 4.184 = 375.0 ккал (посчитано вручную)
  assert.ok(Math.abs(res.per100.kcal - 375.0) < 0.05, String(res.per100.kcal));
  assert.equal(res.name, "Хлебцы");
  assert.deepEqual([res.per100.protein, res.per100.fat, res.per100.carbs], [11, 3, 70]);
  assert.equal(res.servingGrams, null);
  assert.equal(res.packageGrams, null);
});

test("lookupBarcode: не найден (status 0 / 404) или нет nutriments → null", async () => {
  assert.equal(await lookupBarcode("4600000000000", fakeFetch(404, { status: 0, status_verbose: "product not found" })), null);
  assert.equal(await lookupBarcode("4600000000000", fakeFetch(200, { status: 0 })), null);
  assert.equal(await lookupBarcode("4600000000000", fakeFetch(200, { status: 1, product: { product_name: "Вода" } })), null);
});

async function rejectsNetwork(promise) {
  await assert.rejects(promise, (e) => {
    assert.equal(e.kind, "network");
    return true;
  });
}

test("lookupBarcode: сбой сети, HTTP 500 и битый JSON → Error с kind='network', а не null", async () => {
  await rejectsNetwork(lookupBarcode("4607065001234", async () => { throw new TypeError("Load failed"); }));
  await rejectsNetwork(lookupBarcode("4607065001234", fakeFetch(500, {})));
  const broken = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } });
  await rejectsNetwork(lookupBarcode("4607065001234", broken));
});
