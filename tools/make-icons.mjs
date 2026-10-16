// Генерация PNG-иконок без зависимостей (только node:zlib).
// Запуск из корня проекта: node tools/make-icons.mjs

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

const lerp = (a, b, t) => a + (b - a) * t;
const TOP = [52, 199, 120], BOTTOM = [22, 140, 82], WHITE = [255, 255, 255], SOFT = [190, 240, 210];

// Цвет точки в координатах 0..1 (центр 0.5, 0.5).
function sample(x, y) {
  const t = y;
  let c = [lerp(TOP[0], BOTTOM[0], t), lerp(TOP[1], BOTTOM[1], t), lerp(TOP[2], BOTTOM[2], t)];
  const dx = x - 0.5, dy = y - 0.5;
  const r = Math.hypot(dx, dy);
  // Угол от верха по часовой стрелке, 0..1
  const ang = ((Math.atan2(dx, -dy) / (2 * Math.PI)) + 1) % 1;
  const R = 0.25, W = 0.065;
  if (Math.abs(r - R) < W / 2) c = ang < 0.72 ? WHITE : SOFT.map((v, i) => lerp(c[i], v, 0.45));
  // Закруглённые концы дуги
  for (const a of [0, 0.72]) {
    const ex = 0.5 + R * Math.sin(a * 2 * Math.PI), ey = 0.5 - R * Math.cos(a * 2 * Math.PI);
    if (Math.hypot(x - ex, y - ey) < W / 2) c = WHITE;
  }
  // Точка в центре
  if (r < 0.075) c = WHITE;
  return c;
}

function render(size) {
  const SS = 4;
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let rr = 0, gg = 0, bb = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const [r, g, b] = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
        rr += r; gg += g; bb += b;
      }
      const i = (py * size + px) * 4, n = SS * SS;
      buf[i] = Math.round(rr / n); buf[i + 1] = Math.round(gg / n); buf[i + 2] = Math.round(bb / n); buf[i + 3] = 255;
    }
  }
  return png(size, buf);
}

mkdirSync("icons", { recursive: true });
writeFileSync("icons/apple-touch-icon.png", render(180));
writeFileSync("icons/icon-192.png", render(192));
writeFileSync("icons/icon-512.png", render(512));
console.log("icons/: apple-touch-icon.png (180), icon-192.png, icon-512.png");
