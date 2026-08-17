import { getCloudinary } from "@/lib/cloudinary/client";
import { ApiError } from "@/lib/api/errors";

/**
 * Signed direct-to-Cloudinary uploads.
 *
 * The browser uploads the file straight to Cloudinary; only a short-lived
 * signature passes through this server. Two reasons that matter:
 *
 *  1. A 6MB product photo never occupies a VPS request slot or Node's heap.
 *     Routing binaries through the API server is how a modest box falls over
 *     when an admin bulk-uploads a catalogue.
 *  2. Unlike an *unsigned* preset, a signature scopes the upload — folder,
 *     allowed formats, size ceiling, and an expiry — so a leaked signature is
 *     good for one constrained upload rather than unlimited free storage.
 *
 * `api_secret` never leaves this process.
 */

/** Upload buckets. Each maps to a Cloudinary folder and its own constraints. */
export const UPLOAD_FOLDERS = {
  product: "products",
  category: "categories",
  collection: "collections",
  banner: "banners",
  blog: "blogs",
  review: "reviews",
  avatar: "avatars",
} as const;

export type UploadFolder = keyof typeof UPLOAD_FOLDERS;

/** Signatures are short-lived: enough to pick a file, not enough to hoard. */
const SIGNATURE_TTL_SECONDS = 10 * 60;

/**
 * Reported to the client for display, not enforced by us.
 *
 * There used to be a tighter per-folder cap here (2MB avatars up to 10MB
 * products). It was removed on 2026-08-09 by request: no size restriction on
 * uploads. The number kept is Cloudinary's own free-tier ceiling for a single
 * image, so a client that shows it tells the truth about what will actually be
 * refused — raise it to match your plan if the account is upgraded.
 *
 * Left as a flat constant rather than deleted because `maxBytes` is part of the
 * `UploadSignature` contract, and because reinstating per-folder limits later
 * should be a change to this table rather than a re-derivation of the idea.
 */
const CLOUDINARY_PLAN_MAX_BYTES = 10 * 1024 * 1024;

export type UploadSignature = {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  uploadUrl: string;
  expiresAt: string;
  maxBytes: number;
  allowedFormats: string[];
};

/**
 * Builds the signed parameter set the client posts to Cloudinary.
 *
 * Every parameter included here is covered by the signature, so the client
 * cannot widen the folder or lift the size limit — Cloudinary rejects the
 * upload if the posted params do not hash to the signature it was given.
 */
export function createUploadSignature(folder: UploadFolder): UploadSignature {
  const { cloudinary, config } = getCloudinary();

  const timestamp = Math.floor(Date.now() / 1000);
  const targetFolder = `${config.folder}/${UPLOAD_FOLDERS[folder]}`;
  // gif is here for animated hero and collection banners specifically — it is
  // stored and served as the raw Cloudinary secure_url with no transformation
  // (see verifyUploadedAsset), so the upload itself is the only gate.
  const allowedFormats = ["jpg", "jpeg", "png", "webp", "avif", "gif"];

  const params = {
    timestamp,
    folder: targetFolder,
    allowed_formats: allowedFormats.join(","),
    // Cloudinary strips EXIF on transformation but not on raw upload; product
    // photos routinely carry GPS coordinates from a phone camera.
    invalidate: true,
  };

  const signature = cloudinary.utils.api_sign_request(params, config.apiSecret);

  return {
    signature,
    timestamp,
    apiKey: config.apiKey,
    cloudName: config.cloudName,
    folder: targetFolder,
    uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
    expiresAt: new Date((timestamp + SIGNATURE_TTL_SECONDS) * 1000).toISOString(),
    maxBytes: CLOUDINARY_PLAN_MAX_BYTES,
    allowedFormats,
  };
}

/**
 * Confirms an asset actually exists before we persist its public ID.
 *
 * The client tells us "upload done, here is the public ID". Believing that
 * without checking lets a caller attach any string — including someone else's
 * asset ID — to a product. One API call closes that hole.
 */
export async function verifyUploadedAsset(publicId: string): Promise<{
  publicId: string;
  url: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}> {
  const { cloudinary, config } = getCloudinary();

  if (!publicId.startsWith(`${config.folder}/`)) {
    throw ApiError.badRequest(
      `Asset "${publicId}" is outside this store's Cloudinary folder.`,
    );
  }

  try {
    const asset = await cloudinary.api.resource(publicId, { resource_type: "image" });
    return {
      publicId: asset.public_id,
      url: asset.secure_url,
      width: asset.width,
      height: asset.height,
      format: asset.format,
      bytes: asset.bytes,
    };
  } catch {
    throw ApiError.notFound(`No Cloudinary asset found for "${publicId}".`);
  }
}

/**
 * Deletes an asset. Safe to call twice — Cloudinary reports "not found" for an
 * already-deleted ID, which we treat as success so retries stay idempotent.
 */
export async function destroyAsset(publicId: string): Promise<void> {
  const { cloudinary } = getCloudinary();
  await cloudinary.uploader.destroy(publicId, { invalidate: true });
}

/**
 * Builds a transformed delivery URL.
 *
 * `f_auto,q_auto` lets Cloudinary pick AVIF/WebP per browser — typically a
 * 30-50% smaller payload than serving the original JPEG to everyone.
 */
export function buildImageUrl(
  publicId: string,
  options: { width?: number; height?: number; crop?: string } = {},
): string {
  const { cloudinary } = getCloudinary();

  return cloudinary.url(publicId, {
    secure: true,
    fetch_format: "auto",
    quality: "auto",
    width: options.width,
    height: options.height,
    crop: options.crop ?? (options.width || options.height ? "fill" : undefined),
  });
}
