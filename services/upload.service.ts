import { createUploadSignature, verifyUploadedAsset, destroyAsset } from "@/lib/cloudinary/upload";
import type { UploadFolder } from "@/lib/cloudinary/upload";
import { enforceRateLimit } from "@/lib/api/rate-limit";

/**
 * Upload orchestration.
 *
 * Thin by design — the interesting decisions (what a signature covers, why the
 * upload does not pass through this server) live in lib/cloudinary/upload.ts.
 * What this layer adds is the rate limit: signatures are cheap for us to mint
 * but each one authorises consumption of Cloudinary storage and bandwidth, so
 * an authenticated staff account with a runaway script should not be able to
 * mint thousands.
 */

export async function requestSignature(folder: UploadFolder, actorId: string) {
  await enforceRateLimit("upload", actorId);
  return createUploadSignature(folder);
}

/** Confirms an asset exists and is inside our folder before it is persisted. */
export async function confirmUpload(publicId: string) {
  return verifyUploadedAsset(publicId);
}

export async function removeAsset(publicId: string) {
  await destroyAsset(publicId);
  return { deleted: true };
}
