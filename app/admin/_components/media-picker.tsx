"use client";

import { useEffect, useState } from "react";
import { Check, ImageOff, Link2, Loader2, Search, X } from "lucide-react";
import { api, AdminApiError, type ProductImage } from "@/app/admin/_lib/api";

/**
 * "Choose an existing image" — the alternative to uploading a new one.
 *
 * Two sources, because neither alone covers the need:
 *
 *  - **Library.** Every image the catalogue already references, from
 *    `GET /admin/media`. This is the common case: reusing a product photo as a
 *    category hero, or the same shot across a variant set.
 *  - **By URL.** Anything already sitting in the Cloudinary account that Diva
 *    has never attached — including assets another project on the same cloud
 *    uploaded. Those are invisible to the library, because the library is built
 *    from *our* documents, not from Cloudinary.
 *
 * A third source — browsing the whole Cloudinary account — is deliberately
 * absent. It is the Admin API, which needs `CLOUDINARY_API_SECRET`, and this
 * deployment uploads unsigned precisely because there is no secret. The dialog
 * says so rather than omitting the possibility silently.
 */

type MediaAsset = {
  publicId: string;
  url: string;
  alt: string;
  width?: number;
  height?: number;
  usedIn: string;
  usedInType: "product" | "category" | "collection";
};

type LibraryResponse = {
  assets: MediaAsset[];
  cloudBrowsingAvailable: boolean;
};

export function MediaPicker({
  open,
  onClose,
  onPick,
  title = "Choose an existing image",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (image: ProductImage) => void;
  title?: string;
}) {
  const [tab, setTab] = useState<"library" | "url">("library");

  const [search, setSearch] = useState("");

  /**
   * The loaded page, tagged with the query it answers.
   *
   * Keeping the key alongside the data makes "are we loading?" a *derived*
   * value rather than a second state to hold in step with the first — which is
   * the usual way a spinner ends up stuck on after a failed request.
   */
  const [result, setResult] = useState<{
    key: string;
    assets: MediaAsset[];
    cloudBrowsing: boolean;
  } | null>(null);
  const [error, setError] = useState("");

  const queryKey = `${tab}|${search.trim()}`;
  const loading = tab === "library" && result?.key !== queryKey;

  const assets = result?.assets ?? [];
  const cloudBrowsing = result?.cloudBrowsing ?? false;

  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);
  /** Shown before the URL can be attached — see the note on verification. */
  const [previewOk, setPreviewOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open || tab !== "library") return;
    if (result?.key === queryKey) return;

    let cancelled = false;

    /**
     * Debounced, so typing a product name issues one request rather than one
     * per keystroke against an endpoint that aggregates three collections.
     * It also keeps every `setState` below behind an async boundary, which is
     * what stops this effect cascading renders.
     */
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const term = search.trim();
          const response = await api.get<LibraryResponse>("/admin/media", {
            ...(term ? { search: term } : {}),
          });

          if (cancelled) return;

          setResult({
            key: queryKey,
            assets: response.data.assets,
            cloudBrowsing: response.data.cloudBrowsingAvailable,
          });
          setError("");
        } catch (caught) {
          if (cancelled) return;

          // Tag the failure with the key too, so the derived `loading` clears
          // instead of spinning forever on an endpoint that is down.
          setResult({ key: queryKey, assets: [], cloudBrowsing: false });
          setError(
            caught instanceof AdminApiError
              ? caught.message
              : "Could not load the library.",
          );
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, tab, search, queryKey, result?.key]);

  // Escape closes, which is what every dialog on the web does.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const attachUrl = async () => {
    setImporting(true);
    setError("");

    try {
      const response = await api.post<ProductImage>("/admin/media/import", {
        url: url.trim(),
      });

      onPick(response.data);
      onClose();
      setUrl("");
      setPreviewOk(null);
    } catch (caught) {
      setError(
        caught instanceof AdminApiError ? caught.message : "That URL could not be used.",
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      className="picker-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        // Only a click on the backdrop itself closes; one that started inside
        // the panel and drifted out must not discard the dialog.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="picker-panel">
        <div className="picker-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="row-action"
            onClick={onClose}
            aria-label="Close"
          >
            <X />
          </button>
        </div>

        <div className="picker-tabs">
          <button
            type="button"
            className={tab === "library" ? "picker-tab picker-tab-active" : "picker-tab"}
            onClick={() => setTab("library")}
          >
            In use ({assets.length})
          </button>
          <button
            type="button"
            className={tab === "url" ? "picker-tab picker-tab-active" : "picker-tab"}
            onClick={() => setTab("url")}
          >
            <Link2 /> Paste a Cloudinary URL
          </button>
        </div>

        {error && <div className="picker-error">{error}</div>}

        {tab === "library" && (
          <>
            <label className="picker-search">
              <Search />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter by product or category name"
              />
            </label>

            {loading ? (
              <div className="picker-state">
                <Loader2 className="spin" /> Loading images…
              </div>
            ) : assets.length === 0 ? (
              <div className="picker-state">
                <ImageOff />
                <div>
                  <strong>No images attached yet</strong>
                  <p>
                    This library is built from images already used on products,
                    categories and collections — so it fills up as you add them.
                    {!cloudBrowsing && (
                      <>
                        {" "}
                        Browsing your whole Cloudinary account is not available:
                        that needs <code>CLOUDINARY_API_KEY</code> and{" "}
                        <code>CLOUDINARY_API_SECRET</code> on the server. For an
                        asset that is already in Cloudinary, use{" "}
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => setTab("url")}
                        >
                          Paste a Cloudinary URL
                        </button>
                        .
                      </>
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <div className="picker-grid">
                {assets.map((asset) => (
                  <button
                    type="button"
                    key={asset.publicId}
                    className="picker-tile"
                    onClick={() => {
                      onPick({
                        publicId: asset.publicId,
                        url: asset.url,
                        alt: asset.alt,
                        width: asset.width,
                        height: asset.height,
                        displayOrder: 0,
                      });
                      onClose();
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.url} alt={asset.alt} loading="lazy" />
                    <span className="picker-tile-meta">
                      <strong>{asset.usedIn}</strong>
                      <small>{asset.usedInType}</small>
                    </span>
                    <span className="picker-tile-pick">
                      <Check />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "url" && (
          <div className="picker-url">
            <label className="field">
              <span>Cloudinary image URL</span>
              <input
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setPreviewOk(null);
                }}
                placeholder="https://res.cloudinary.com/dlcq8i2sc/image/upload/v1712345678/folder/photo.jpg"
                autoFocus
              />
              <small>
                Open the image in Cloudinary&apos;s Media Library, copy its delivery
                URL and paste it here. Only URLs on this store&apos;s own cloud are
                accepted — an image hosted elsewhere disappears the day someone else
                deletes it.
              </small>
            </label>

            {/*
              The asset is never verified server-side: that is the Admin API, which
              needs the secret we do not have. So the preview *is* the verification —
              if it does not render, the URL is wrong, and attaching is blocked.
            */}
            {url.trim() && (
              <div className="picker-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url.trim()}
                  alt=""
                  onLoad={() => setPreviewOk(true)}
                  onError={() => setPreviewOk(false)}
                />
                <p className={previewOk === false ? "preview-bad" : "preview-good"}>
                  {previewOk === null
                    ? "Loading preview…"
                    : previewOk
                      ? "Image loads correctly."
                      : "That URL does not load an image. Check it and try again."}
                </p>
              </div>
            )}

            <div className="editor-footer">
              <button type="button" className="secondary-button" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!url.trim() || previewOk !== true || importing}
                onClick={attachUrl}
              >
                {importing ? <Loader2 className="spin" /> : <Check />}
                {importing ? "Attaching…" : "Use this image"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
