/**
 * Client-side image compression.
 *
 * Why this exists: the vision model charges per input token and image tokens
 * scale with pixel count (~ width·height / 750). A 12-megapixel phone photo
 * is wasteful and slow; downscaling to 1600px on the longest edge is still
 * plenty of detail for food identification and brings cost + latency down by
 * ~5–10×.
 *
 * Free bonus: canvas re-encoding drops EXIF — so GPS/orientation metadata
 * never reaches the server. We don't need a separate stripping step.
 *
 * Returns a JPEG Blob. HEIC/PNG inputs are transcoded automatically because
 * the browser decodes them to a canvas and we re-encode as JPEG.
 */

const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.85;

export type CompressResult = {
  blob: Blob;
  width: number;
  height: number;
  originalBytes: number;
  compressedBytes: number;
};

export async function compressImage(file: File): Promise<CompressResult> {
  const bitmap = await loadBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE_PX);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not available.");
  ctx.drawImage(bitmap, 0, 0, width, height);

  // Free the decoded bitmap early — phone photos are big.
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  if (!blob) throw new Error("Image encoding failed.");

  return {
    blob,
    width,
    height,
    originalBytes: file.size,
    compressedBytes: blob.size,
  };
}

/**
 * createImageBitmap handles JPEG/PNG/WEBP natively in all modern browsers;
 * HEIC support varies but iOS Safari decodes it fine. For anything exotic
 * we fall back to an HTMLImageElement with an object URL.
 */
async function loadBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadHTMLImage(url);
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function loadHTMLImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image."));
    img.src = src;
  });
}

function fitWithin(
  w: number,
  h: number,
  max: number
): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h };
  const scale = max / Math.max(w, h);
  return {
    width: Math.round(w * scale),
    height: Math.round(h * scale),
  };
}
