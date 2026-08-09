"use client";

/**
 * ⚠️ UNUSED — and describing a path the admin no longer takes.
 *
 * The admin UI's only upload implementation is
 * `app/admin/_components/image-upload.tsx`, which on 2026-08-08 was switched to
 * **unsigned** uploads with a public preset, because the Cloudinary account in
 * use has no API secret available. Nothing imports this file.
 *
 * It is kept because it is a working client for the *signed* endpoint that
 * still exists at `POST /api/v1/uploads/signature` — which is the path to move
 * back to once `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` are filled in.
 * If that migration is not planned, delete this file rather than leaving two
 * upload implementations to drift apart.
 */

export type UploadedAsset = {
  publicId: string;
  url: string;
  width: number;
  height: number;
};

export type UploadFolder =
  | "product"
  | "category"
  | "collection"
  | "banner"
  | "blog"
  | "review"
  | "avatar";

type SignatureResponse = {
  success: true;
  data: {
    signature: string;
    timestamp: number;
    apiKey: string;
    cloudName: string;
    folder: string;
    uploadUrl: string;
    maxBytes: number;
    allowedFormats: string[];
  };
};

async function fetchSignature(folder: UploadFolder) {
  const response = await fetch(`/api/v1/uploads/signature?folder=${folder}`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Could not authorise the upload.");
  }

  const body = (await response.json()) as SignatureResponse;
  return body.data;
}

/** Uploads one file. Throws with a message suitable for display. */
export async function uploadImage(
  file: File,
  folder: UploadFolder = "product",
): Promise<UploadedAsset> {
  const signature = await fetchSignature(folder);

  // Checked here purely to fail fast with a clear message; Cloudinary enforces
  // the real limit, because a client-side check is a hint, not a control.
  if (file.size > signature.maxBytes) {
    const limitMb = Math.round(signature.maxBytes / (1024 * 1024));
    throw new Error(`"${file.name}" is larger than the ${limitMb}MB limit.`);
  }

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", signature.apiKey);
  form.append("timestamp", String(signature.timestamp));
  form.append("signature", signature.signature);
  form.append("folder", signature.folder);
  form.append("allowed_formats", signature.allowedFormats.join(","));
  form.append("invalidate", "true");

  const response = await fetch(signature.uploadUrl, { method: "POST", body: form });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error?.message ?? `Upload of "${file.name}" failed.`);
  }

  const asset = await response.json();

  return {
    publicId: asset.public_id,
    url: asset.secure_url,
    width: asset.width,
    height: asset.height,
  };
}

/**
 * Uploads several files, reporting per-file outcomes.
 *
 * Deliberately not `Promise.all`: one oversized file among eight should not
 * discard seven successful uploads. The caller decides what to do with the
 * failures.
 */
export async function uploadImages(
  files: FileList | File[],
  folder: UploadFolder = "product",
): Promise<{ uploaded: UploadedAsset[]; failed: { name: string; reason: string }[] }> {
  const results = await Promise.allSettled(
    Array.from(files).map((file) => uploadImage(file, folder)),
  );

  const uploaded: UploadedAsset[] = [];
  const failed: { name: string; reason: string }[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      uploaded.push(result.value);
    } else {
      failed.push({
        name: Array.from(files)[index]?.name ?? "file",
        reason: result.reason instanceof Error ? result.reason.message : "Upload failed",
      });
    }
  });

  return { uploaded, failed };
}

/**
 * React change-handler wrapper, kept for the call shape the admin forms use.
 * Returns the assets so a caller can also persist the public IDs.
 */
export async function handleImageUpload(
  event: React.ChangeEvent<HTMLInputElement>,
  setImages: React.Dispatch<React.SetStateAction<UploadedAsset[]>>,
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
  folder: UploadFolder = "product",
): Promise<UploadedAsset[]> {
  if (!event.target.files?.length) return [];

  setIsLoading(true);
  try {
    const { uploaded, failed } = await uploadImages(event.target.files, folder);
    if (failed.length) {
      console.error("[upload] some files were rejected:", failed);
    }
    setImages((previous) => [...previous, ...uploaded]);
    return uploaded;
  } finally {
    setIsLoading(false);
    // Let the same file be re-selected after a failed attempt.
    event.target.value = "";
  }
}

export function removeImage(
  index: number,
  setImages: React.Dispatch<React.SetStateAction<UploadedAsset[]>>,
): void {
  setImages((previous) => previous.filter((_, i) => i !== index));
}
