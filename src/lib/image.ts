import type { PendingImage } from "./types";

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* упадём на <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Не удалось прочитать изображение"));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function render(src: CanvasImageSource, w: number, h: number, maxSide: number, quality: number): string {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");
  ctx.fillStyle = "#fff"; // прозрачные PNG → белый фон, иначе JPEG станет чёрным
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(src, 0, 0, cw, ch);
  return canvas.toDataURL("image/jpeg", quality);
}

const approxBytes = (dataUrl: string) => Math.floor((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);

/** Сжимает фото в JPEG так, чтобы уложиться в maxBytes (сначала качество, потом размер). */
export async function compressImage(file: File | Blob, maxBytes: number): Promise<PendingImage> {
  if (!file.type.startsWith("image/")) throw new Error("Это не изображение");
  const d = await decode(file);
  try {
    let side = 1600;
    let quality = 0.85;
    let dataUrl = render(d.source, d.width, d.height, side, quality);
    for (let i = 0; i < 12 && approxBytes(dataUrl) > maxBytes; i++) {
      if (quality > 0.55) quality -= 0.1;
      else side = Math.round(side * 0.8);
      dataUrl = render(d.source, d.width, d.height, side, quality);
    }
    if (approxBytes(dataUrl) > maxBytes) throw new Error("Фото слишком большое, выбери другое");
    const thumb = render(d.source, d.width, d.height, 180, 0.6);
    return { dataUrl, thumb, bytes: approxBytes(dataUrl), name: (file as File).name || "Скриншот" };
  } finally {
    d.close?.();
  }
}
