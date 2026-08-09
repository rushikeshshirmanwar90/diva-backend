import { ApiError } from "@/lib/api/errors";
import { env } from "@/config/env";
import * as media from "@/repositories/media.repository";
import type { z } from "zod";
import type { listMediaSchema, importImageSchema } from "@/validators/catalog";

/**
 * Media library.
 *
 * Two ways to attach an image without uploading one: pick something the
 * catalogue already uses, or paste a URL for an asset that exists in the
 * Cloudinary account but has never been attached here.
 */

type ListInput = z.infer<typeof listMediaSchema>;
type ImportInput = z.infer<typeof importImageSchema>;

export async function listLibrary(input: ListInput) {
  const assets = await media.listCatalogueImages(input);

  return {
    assets,
    /**
     * Tells the admin UI why the list may look short, so an empty library reads
     * as "nothing attached yet" rather than "this feature is broken".
     */
    source: "catalogue" as const,
    cloudBrowsingAvailable: Boolean(env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET),
  };
}

/**
 * Accepts a pasted image URL and turns it into an attachable asset.
 *
 * The URL is restricted to the store's own Cloudinary cloud. That is not
 * pedantry: an image referenced from a host we do not control disappears the
 * day someone else deletes it, and a product page with a dead hero image is a
 * lost sale nobody gets alerted about. It also stops the storefront's image
 * optimiser being pointed at arbitrary hosts, which is a bandwidth bill an
 * outsider gets to run up.
 */
export async function importByUrl(input: ImportInput) {
  const cloudName = env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? env.CLOUDINARY_CLOUD_NAME;

  if (!cloudName) {
    throw ApiError.serviceUnavailable(
      "No Cloudinary cloud is configured, so an image URL cannot be verified.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    throw ApiError.badRequest("That is not a valid URL.");
  }

  if (parsed.hostname !== "res.cloudinary.com") {
    throw ApiError.badRequest(
      "Only images hosted on res.cloudinary.com can be attached. Upload the file instead.",
    );
  }

  const publicId = extractPublicId(parsed.pathname, cloudName);

  if (!publicId) {
    throw ApiError.badRequest(
      `That URL does not point at the "${cloudName}" Cloudinary account. ` +
        `Copy the delivery URL from the Media Library of that account.`,
    );
  }

  /**
   * The asset is not verified to exist.
   *
   * Verification is `cloudinary.api.resource()`, which is the Admin API and
   * needs the secret this deployment does not hold. So a typo in the path
   * produces a broken image rather than a 404 here — which is why the admin UI
   * previews the URL before it can be saved.
   */
  return {
    publicId,
    url: input.url,
    alt: input.alt ?? publicId.split("/").pop() ?? "Image",
    displayOrder: 0,
    verified: false,
  };
}

/**
 * Pulls the public ID out of a Cloudinary delivery URL.
 *
 * The shape is `/<cloud>/image/upload/[transformations/][v123/]<public id>.<ext>`
 * where both the transformation segment and the version are optional and the
 * public ID itself may contain slashes. So the parse is: confirm the cloud,
 * drop everything up to and including `upload`, drop a leading `v<digits>` and
 * any transformation segment, then strip the extension.
 */
function extractPublicId(pathname: string, cloudName: string): string | null {
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== cloudName) return null;

  const uploadIndex = segments.indexOf("upload");
  if (uploadIndex === -1) return null;

  let rest = segments.slice(uploadIndex + 1);

  // A transformation segment is a comma-separated list of `k_v` pairs; a public
  // ID folder never looks like that.
  if (rest[0] && /^[a-z]{1,3}_[^/]+/.test(rest[0]) && rest[0].includes("_")) {
    rest = rest.slice(1);
  }

  if (rest[0] && /^v\d+$/.test(rest[0])) rest = rest.slice(1);

  if (rest.length === 0) return null;

  return rest.join("/").replace(/\.[a-z0-9]+$/i, "");
}
