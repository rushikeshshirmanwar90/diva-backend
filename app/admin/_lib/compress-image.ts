/**
 * Client-side image compression, run before anything is uploaded.
 *
 * Cloudinary's free tier refuses a single image over 10MB, and a 40MB PNG
 * straight off a camera or a design tool is common. Rather than rejecting those
 * files — or making someone open Photoshop — the browser re-encodes them down
 * to something that fits.
 *
 * Three rules the implementation follows, each of them the difference between
 * "compressed" and "damaged":
 *
 *  1. **Files already under the limit are returned untouched.** Re-encoding a
 *     2MB JPEG to "help" costs a generation of quality and gains nothing. Only
 *     oversized files are processed.
 *  2. **Quality is reduced before dimensions are.** A 6000px product photo at
 *     q0.85 is almost always small enough, and keeping the pixels means the
 *     storefront can still crop and zoom. Scaling down is the fallback, not the
 *     first move.
 *  3. **Transparency survives.** A PNG with an alpha channel re-encoded as JPEG
 *     gains a black background — catastrophic for a cut-out product shot on a
 *     white page, and not obvious until it is live. Those go to WebP instead.
 */

/**
 * Cloudinary's own per-image ceiling on the free tier, less headroom for the
 * multipart envelope. Raise this if the account is upgraded — Plus allows 20MB.
 */
export const UPLOAD_TARGET_BYTES = 9.5 * 1024 * 1024;

export type CompressionResult = {
  file: File;
  /** False when the original was already small enough and was passed through. */
  compressed: boolean;
  originalBytes: number;
  finalBytes: number;
};

/**
 * Progressively harder attempts, stopping at the first that fits.
 *
 * Quality-only steps come first (rule 2). The later entries scale down as well,
 * for the genuinely enormous — a 12000×9000 scan will not fit at any quality
 * because the pixel count alone dominates.
 */
const ATTEMPTS: Array<{ scale: number; quality: number }> = [
  { scale: 1, quality: 0.85 },
  { scale: 1, quality: 0.72 },
  { scale: 0.8, quality: 0.72 },
  { scale: 0.65, quality: 0.7 },
  { scale: 0.5, quality: 0.7 },
  { scale: 0.4, quality: 0.65 },
  { scale: 0.3, quality: 0.6 },
];

export async function compressImage(
  file: File,
  options: { maxBytes?: number } = {},
): Promise<CompressionResult> {
  const maxBytes = options.maxBytes ?? UPLOAD_TARGET_BYTES;

  const untouched: CompressionResult = {
    file,
    compressed: false,
    originalBytes: file.size,
    finalBytes: file.size,
  };

  if (file.size <= maxBytes) return untouched;

  /**
   * SVG and GIF are passed through deliberately.
   *
   * Rasterising an SVG throws away the thing that makes it useful, and drawing
   * a GIF to a canvas keeps only the first frame — silently turning an
   * animation into a still. Neither is a compression problem worth "solving".
   */
  if (file.type === "image/svg+xml" || file.type === "image/gif") return untouched;

  let bitmap: ImageBitmap;

  try {
    // `from-image` applies the EXIF orientation flag. Without it, photos taken
    // on a phone held sideways upload rotated — and the rotation is baked in,
    // so it cannot be fixed later without re-uploading.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // An unreadable or exotic format. Let Cloudinary have it and report back.
    return untouched;
  }

  // A PNG may carry alpha; assume it does rather than reading pixels to check.
  // WebP keeps the channel and still compresses hard, so the guess is cheap
  // even when wrong.
  const mimeType = /png|webp|avif/i.test(file.type) ? "image/webp" : "image/jpeg";
  const extension = mimeType === "image/webp" ? "webp" : "jpg";

  try {
    let smallest: Blob | null = null;

    for (const attempt of ATTEMPTS) {
      const blob = await render(bitmap, attempt.scale, mimeType, attempt.quality);
      if (!blob) continue;

      if (!smallest || blob.size < smallest.size) smallest = blob;
      if (blob.size <= maxBytes) {
        smallest = blob;
        break;
      }
    }

    if (!smallest) return untouched;

    /**
     * If every attempt still overshoots, the smallest one is returned anyway.
     * It is strictly closer to acceptable than the original, and Cloudinary's
     * own rejection message — which names the limit — is a better explanation
     * than anything invented here.
     */
    return {
      file: new File([smallest], renameTo(file.name, extension), {
        type: mimeType,
        lastModified: Date.now(),
      }),
      compressed: true,
      originalBytes: file.size,
      finalBytes: smallest.size,
    };
  } finally {
    // Frees the decoded bitmap immediately. A handful of 40MP images left to
    // the garbage collector is hundreds of megabytes of retained memory.
    bitmap.close();
  }
}

/** Draws the bitmap at a scale and encodes it. */
async function render(
  bitmap: ImageBitmap,
  scale: number,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  // OffscreenCanvas keeps the work off the DOM. Safari gained it late, so the
  // regular canvas path stays as a fallback rather than an assumption.
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: mimeType, quality });
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.drawImage(bitmap, 0, 0, width, height);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

/** `IMG_4821.PNG` → `IMG_4821.webp`, so the name still matches the bytes. */
function renameTo(name: string, extension: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.${extension}`;
}

/** `11.4 MB` — for telling someone what just happened to their file. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
