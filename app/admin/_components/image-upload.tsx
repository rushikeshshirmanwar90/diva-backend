"use client";

import { useCallback, useRef, useState } from "react";
import { Images, ImagePlus, Info, Loader2, X } from "lucide-react";
import { type ProductImage } from "@/app/admin/_lib/api";
import { MediaPicker } from "@/app/admin/_components/media-picker";
import { compressImage, formatBytes } from "@/app/admin/_lib/compress-image";

/**
 * Direct-to-Cloudinary image upload, shared by every editor that takes images.
 *
 * **This uses an unsigned upload preset**, chosen deliberately on 2026-08-08
 * because the Cloudinary account in use (`dlcq8i2sc`, shared with the
 * real-estate project) has no API secret to hand. The server is not involved:
 * the browser posts the file straight to Cloudinary with a preset name that is
 * visible in the JS bundle.
 *
 * What that costs, stated plainly so nobody has to rediscover it:
 *
 *  - The preset is a **public write credential**. Anyone who opens devtools can
 *    upload to this Cloudinary account, and you pay for the storage.
 *  - The `folder`, size and format checks below are **advisory**. They shape
 *    what the admin UI does; they bind nothing, because an attacker does not
 *    run this code. Real limits must be configured on the preset itself in the
 *    Cloudinary dashboard — restrict formats, cap the file size, and lock the
 *    folder there.
 *  - There is no `verifyUploadedAsset` step, so a `publicId` we persist is
 *    whatever the browser reported.
 *
 * The signed path still exists server-side in `lib/cloudinary/upload.ts` and
 * `POST /api/v1/uploads/signature`. Migrating back is: fill in
 * `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`, and swap `uploadToCloudinary`
 * below for a call to that endpoint.
 */

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

/**
 * Cloudinary sub-folders, mirroring `UPLOAD_FOLDERS` in
 * `lib/cloudinary/upload.ts` so both paths file assets identically and a
 * migration back does not scatter a second copy of the catalogue.
 *
 * `folder` is one of the few parameters an unsigned upload may set, so this
 * still works — as an organisational convenience, not a boundary.
 */
const FOLDER_PATHS = {
  product: "products",
  category: "categories",
  collection: "collections",
  banner: "banners",
  blog: "blogs",
  review: "reviews",
  avatar: "avatars",
} as const;

export type UploadFolder = keyof typeof FOLDER_PATHS;

/**
 * No client-side size limit, by request (2026-08-09).
 *
 * There used to be a per-folder byte cap here. It is gone: any file the browser
 * can read is now sent. Two consequences worth knowing rather than discovering:
 *
 *  - **Cloudinary still has its own ceiling**, and it is the one that actually
 *    applies. On the free tier a single image may be at most 10MB; paid plans
 *    raise it to 20MB and up. A file over that is rejected *by Cloudinary*, and
 *    `describeUploadError` below turns that response into a message that says
 *    so, rather than a generic failure.
 *  - Nothing here throttles a 40MB upload over a slow connection, which is why
 *    the upload reports progress instead of showing an indefinite spinner.
 */

/** Prefix inside the account, keeping Diva separable from the other project. */
const ROOT_FOLDER = "diva";

type UploadOptions = {
  folder: UploadFolder;
  /** Used as `alt` text when the caller has no better name — usually the title. */
  altFallback?: string;
  /** `displayOrder` for the first new image; subsequent ones increment. */
  startIndex?: number;
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Whether uploads can work at all.
 *
 * Synchronous now, and no network call: both values are inlined into the bundle
 * at build time, so there is nothing to ask the server. Note the consequence —
 * changing either variable requires a **rebuild**, not just a restart, because
 * `NEXT_PUBLIC_*` is substituted at compile time.
 */
export function useUploadsConfigured(): boolean {
  return Boolean(CLOUD_NAME && UPLOAD_PRESET);
}

/** Shown wherever an upload control would otherwise sit uselessly. */
export function UploadsNotConfigured() {
  return (
    <div className="upload-notice" role="status">
      <Info />
      <span>
        Image uploads are switched off — set{" "}
        <code>NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME</code> and{" "}
        <code>NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET</code> in the server&apos;s{" "}
        <code>.env</code>, then <strong>rebuild</strong> — these are compiled into
        the bundle, so a restart alone will not pick them up.
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The upload itself
// ---------------------------------------------------------------------------

type CloudinaryAsset = {
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
};

/**
 * Turns a Cloudinary error into something an operator can act on.
 *
 * Its own wording is kept — the messages are specific and useful — but the two
 * that need extra context get it. "File size too large" in particular reads as
 * a bug in our code when it is actually the account's plan limit, and the fix
 * is on Cloudinary's side, not ours.
 */
function describeUploadError(message: string | undefined, status: number): string {
  const text = message ?? `Cloudinary returned ${status}.`;

  if (/file size too large|maximum is/i.test(text)) {
    return (
      `${text} This is Cloudinary's own limit for your plan — the free tier caps ` +
      `a single image at 10MB. Either compress the image or raise the limit on ` +
      `the Cloudinary account; nothing in this admin restricts the size.`
    );
  }

  if (/preset/i.test(text)) {
    return (
      `${text} Check that an upload preset named "${UPLOAD_PRESET}" exists on ` +
      `cloud "${CLOUD_NAME}" and that its signing mode is Unsigned.`
    );
  }

  return text;
}

/**
 * Posts one file to Cloudinary's unsigned endpoint, reporting progress.
 *
 * `XMLHttpRequest` rather than `fetch` for one reason: fetch cannot report
 * *upload* progress. With the size cap removed a 40MB file is now allowed, and
 * an indefinite spinner through a two-minute upload is indistinguishable from a
 * hang — people cancel and retry, which makes it slower still.
 *
 * Only parameters Cloudinary accepts on an unsigned upload are sent — the
 * preset, the file and the folder. Adding anything else (a transformation, a
 * tag policy) makes Cloudinary reject the whole request with a message about
 * the parameter not being allowed, which is easy to misread as a bad preset.
 */
function uploadToCloudinary(
  file: File,
  folder: UploadFolder,
  onProgress?: (fraction: number) => void,
): Promise<CloudinaryAsset> {
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET!);
  form.append("folder", `${ROOT_FOLDER}/${FOLDER_PATHS[folder]}`);

  return new Promise<CloudinaryAsset>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);

    request.upload.addEventListener("progress", (event) => {
      // `lengthComputable` is false for a chunked body; reporting 0% forever
      // would be worse than showing the indeterminate state.
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    });

    request.addEventListener("load", () => {
      let body: { error?: { message?: string } } | CloudinaryAsset | null = null;

      try {
        body = JSON.parse(request.responseText);
      } catch {
        // Cloudinary answers with HTML on some gateway-level failures.
      }

      if (request.status >= 200 && request.status < 300 && body && "public_id" in body) {
        resolve(body);
        return;
      }

      const message = body && "error" in body ? body.error?.message : undefined;
      reject(new Error(describeUploadError(message, request.status)));
    });

    request.addEventListener("error", () =>
      reject(new Error("The upload could not reach Cloudinary. Check your connection.")),
    );

    request.addEventListener("abort", () => reject(new Error("Upload cancelled.")));

    request.send(form);
  });
}

export type UploadProgress = {
  /** 1-based index of the file being sent, and how many there are. */
  current: number;
  total: number;
  /** 0–1 for the current file, or null while the browser cannot measure it. */
  fraction: number | null;
  fileName: string;
  /**
   * Compression happens first and can take a couple of seconds on a large
   * image, with no measurable progress — so it gets its own label rather than
   * showing "Uploading 0%" while the CPU works.
   */
  stage: "compressing" | "uploading";
};

export function useImageUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [compressionNotes, setCompressionNotes] = useState<string[]>([]);
  const [error, setError] = useState("");

  /**
   * Uploads a batch and resolves with the assets that succeeded.
   *
   * A file Cloudinary rejects is reported and *skipped* rather than failing the
   * batch. Someone selecting eight photos and losing all of them because the
   * third exceeded the plan limit is a worse outcome than seven uploads and a
   * message.
   *
   * Files go one at a time, not in parallel. Six concurrent 30MB uploads
   * saturate an ordinary connection and every one of them crawls; sequential
   * means the first images are usable while the rest are still going, and the
   * progress figure means something.
   */
  const upload = useCallback(
    async (files: FileList | File[], options: UploadOptions): Promise<ProductImage[]> => {
      if (!CLOUD_NAME || !UPLOAD_PRESET) {
        setError("Image uploads are not configured on this build.");
        return [];
      }

      const list = Array.from(files);

      setUploading(true);
      setError("");

      const uploaded: ProductImage[] = [];
      const startIndex = options.startIndex ?? 0;
      /** What was compressed, reported once at the end rather than per file. */
      const notes: string[] = [];

      try {
        for (const [index, original] of list.entries()) {
          const position = { current: index + 1, total: list.length };

          try {
            /**
             * Oversized files are re-encoded in the browser first, so
             * Cloudinary's 10MB ceiling stops being something the person
             * uploading has to think about. Files already under it pass
             * straight through untouched — see `compress-image.ts`.
             */
            setProgress({
              ...position,
              fraction: null,
              fileName: original.name,
              stage: "compressing",
            });

            const { file, compressed, originalBytes, finalBytes } =
              await compressImage(original);

            if (compressed) {
              notes.push(
                `${original.name} compressed ${formatBytes(originalBytes)} → ${formatBytes(finalBytes)}`,
              );
            }

            setProgress({
              ...position,
              fraction: 0,
              fileName: file.name,
              stage: "uploading",
            });

            const asset = await uploadToCloudinary(file, options.folder, (fraction) =>
              setProgress({
                ...position,
                fraction,
                fileName: file.name,
                stage: "uploading",
              }),
            );

            uploaded.push({
              publicId: asset.public_id,
              url: asset.secure_url,
              // Named from the *original*, so a `.png` renamed to `.webp` by
              // the compressor does not leak into the alt text.
              alt: options.altFallback?.trim() || original.name.replace(/\.[^.]+$/, ""),
              width: asset.width,
              height: asset.height,
              displayOrder: startIndex + uploaded.length,
            });
          } catch (caught) {
            setError(
              caught instanceof Error
                ? `"${original.name}": ${caught.message}`
                : `Cloudinary rejected "${original.name}".`,
            );
          }
        }

        setCompressionNotes(notes);
        return uploaded;
      } finally {
        setUploading(false);
        setProgress(null);
      }
    },
    [],
  );

  return {
    upload,
    uploading,
    progress,
    error,
    /** Human-readable "x MB → y MB" lines for whatever was re-encoded. */
    compressionNotes,
    clearError: () => setError(""),
  };
}

/** "Uploading 2 of 5 — 62%", or "Compressing…" during the re-encode. */
export function progressLabel(progress: UploadProgress | null): string {
  if (!progress) return "Uploading…";

  const position = progress.total > 1 ? ` ${progress.current} of ${progress.total}` : "";

  if (progress.stage === "compressing") return `Compressing${position}…`;

  const percent =
    progress.fraction === null ? "" : ` — ${Math.round(progress.fraction * 100)}%`;

  return `Uploading${position}${percent}`;
}

// ---------------------------------------------------------------------------
// Single-image field
// ---------------------------------------------------------------------------

/**
 * One image, with a preview and a replace/remove control.
 *
 * Categories, collections and banners each carry a single hero image rather
 * than a gallery, so this renders a compact tile instead of the product
 * editor's dropzone-plus-grid.
 */
export function ImageField({
  label,
  hint,
  folder,
  altFallback,
  value,
  onChange,
  onError,
}: {
  label: string;
  hint?: string;
  folder: UploadFolder;
  altFallback?: string;
  value?: ProductImage | null;
  onChange: (image: ProductImage | null) => void;
  /** Lets the parent surface upload failures in its own error row. */
  onError?: (message: string) => void;
}) {
  const { upload, uploading, progress, compressionNotes } = useImageUpload();
  const configured = useUploadsConfigured();
  const fileInput = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);

  const pick = async (files: FileList) => {
    const [image] = await upload(files, { folder, altFallback });

    if (image) {
      onChange(image);
    } else {
      onError?.("That image could not be uploaded.");
    }

    // Reset so re-selecting the same file still fires a change event.
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <div className="image-field">
      <span className="image-field-label">{label}</span>

      <div className="image-field-body">
        {value ? (
          <div className="media-tile image-field-tile">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value.url} alt={value.alt} />
            <button
              type="button"
              className="media-remove"
              aria-label={`Remove ${label.toLowerCase()}`}
              onClick={() => onChange(null)}
            >
              <X />
            </button>
          </div>
        ) : (
          <div className="media-tile image-field-tile image-field-empty">
            <ImagePlus />
          </div>
        )}

        <div className="image-field-actions">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => event.target.files && void pick(event.target.files)}
          />
          <button
            type="button"
            className="secondary-button"
            disabled={uploading || !configured}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? <Loader2 className="spin" /> : null}
            {uploading ? progressLabel(progress) : value ? "Replace" : "Upload image"}
          </button>

          {/*
            Always available, even when uploads are switched off — picking an
            existing image needs no Cloudinary credentials at all, so it is the
            one control that still works on a half-configured deployment.
          */}
          <button
            type="button"
            className="link-button"
            disabled={uploading}
            onClick={() => setPicking(true)}
          >
            <Images /> Choose an existing image
          </button>

          {uploading && progress?.fraction != null && (
            <progress className="upload-bar" value={progress.fraction} max={1} />
          )}

          {!uploading && compressionNotes.length > 0 && (
            <small className="compress-note">{compressionNotes[0]}</small>
          )}

          {hint && !uploading && compressionNotes.length === 0 && <small>{hint}</small>}
        </div>
      </div>

      {!configured && <UploadsNotConfigured />}

      <MediaPicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(image) => onChange(image)}
        title={`Choose an image for ${label.toLowerCase()}`}
      />
    </div>
  );
}
