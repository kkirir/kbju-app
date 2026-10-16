// Подготовка фото для Claude: уменьшение до 1568 px по длинной стороне и JPEG 0.85.
// Работает только в браузере (canvas), тестами Node не покрывается.

const MAX_SIDE = 1568;
const QUALITY = 0.85;

// Декодирует файл с учётом EXIF-поворота. createImageBitmap — основной путь,
// <img> — запасной (старый Safari, необычные форматы).
async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close && bmp.close() };
    } catch {
      // падаем на запасной путь через <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Не удалось открыть фото"));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    // revoke после загрузки безопасен: картинка уже декодирована
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * @param {Blob} file фото из <input type="file">
 * @returns {Promise<{ base64: string, mediaType: "image/jpeg" }>}
 */
export async function prepareImage(file) {
  if (!file) throw new Error("Нет фото");
  const pic = await decode(file);
  try {
    if (!pic.width || !pic.height) throw new Error("Не удалось открыть фото");
    const scale = Math.min(1, MAX_SIDE / Math.max(pic.width, pic.height));
    const w = Math.max(1, Math.round(pic.width * scale));
    const h = Math.max(1, Math.round(pic.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // прозрачность PNG иначе станет чёрной в JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(pic.source, 0, 0, w, h);

    const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
    const comma = dataUrl.indexOf(",");
    if (!dataUrl.startsWith("data:image/jpeg") || comma < 0) throw new Error("Не удалось сжать фото");
    // освобождаем память canvas на iOS
    canvas.width = canvas.height = 0;
    return { base64: dataUrl.slice(comma + 1), mediaType: "image/jpeg" };
  } finally {
    pic.close();
  }
}
