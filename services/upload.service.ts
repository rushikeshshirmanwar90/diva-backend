import { createUploadSignature, verifyUploadedAsset, destroyAsset } from "@/lib/cloudinary/upload";
import type { UploadFolder } from "@/lib/cloudinary/upload";

/**
 * Upload orchestration.
 *
 * Thin by design — the interesting decisions (what a signature covers, why the
 * upload does not pass through this server) live in lib/cloudinary/upload.ts.
 */

export async function requestSignature(folder: UploadFolder) {
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
