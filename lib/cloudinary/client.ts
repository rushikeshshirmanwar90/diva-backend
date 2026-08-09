import { v2 as cloudinary } from "cloudinary";
import { cloudinaryConfig } from "@/config/env";
import { ApiError } from "@/lib/api/errors";

/**
 * The configured Cloudinary SDK.
 *
 * Configuration is applied lazily and once. Calling `cloudinary.config()` at
 * module scope would run during the Next build, where the env may legitimately
 * be incomplete, and would fail the build over a credential nothing in the
 * build actually needs.
 */
let configured = false;

export function getCloudinary() {
  const config = cloudinaryConfig();

  if (!config) {
    throw ApiError.serviceUnavailable(
      "Image uploads are not configured. Set CLOUDINARY_CLOUD_NAME, " +
        "CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.",
    );
  }

  if (!configured) {
    cloudinary.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret,
      secure: true,
    });
    configured = true;
  }

  return { cloudinary, config };
}

export function isCloudinaryConfigured(): boolean {
  return cloudinaryConfig() !== null;
}
