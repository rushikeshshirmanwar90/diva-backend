/**
 * YouTube link handling.
 *
 * A product's video is pasted by an admin from whatever YouTube gave them —
 * the Shorts page, the share sheet, the desktop watch URL. Those are four
 * different shapes for the same video, and only one of them embeds:
 *
 *   https://www.youtube.com/shorts/ABC123          ← Shorts page
 *   https://youtube.com/shorts/ABC123?feature=share ← share sheet
 *   https://youtu.be/ABC123                         ← short link
 *   https://www.youtube.com/watch?v=ABC123          ← desktop
 *   https://www.youtube.com/embed/ABC123            ← the embeddable one
 *
 * So the id is extracted once, here, rather than each surface writing its own
 * regex and one of them quietly failing on the form nobody tested with.
 */

/** YouTube ids are 11 characters of URL-safe base64. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Pulls the video id out of any YouTube URL, or returns null.
 *
 * Null means "not a YouTube link I recognise" — the validator turns that into a
 * message about the link rather than storing something that will render as an
 * empty box on the product page.
 */
export function toYouTubeVideoId(input: string): string | null {
  let url: URL;

  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  // youtu.be/ABC123 — the id is the whole path.
  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    return VIDEO_ID.test(id) ? id : null;
  }

  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "youtube-nocookie.com") {
    return null;
  }

  // watch?v=ABC123
  const queryId = url.searchParams.get("v");
  if (queryId && VIDEO_ID.test(queryId)) return queryId;

  // shorts/ABC123, embed/ABC123, live/ABC123 — all id-after-segment forms.
  const [segment, id] = url.pathname.split("/").filter(Boolean);
  if (segment && id && ["shorts", "embed", "live", "v"].includes(segment)) {
    return VIDEO_ID.test(id) ? id : null;
  }

  return null;
}

export function isYouTubeUrl(input: string): boolean {
  return toYouTubeVideoId(input) !== null;
}

/**
 * The privacy-preserving embed URL for a video.
 *
 * `youtube-nocookie.com` because a product page should not drop advertising
 * cookies on a shopper who never pressed play.
 */
export function toYouTubeEmbedUrl(input: string): string | null {
  const id = toYouTubeVideoId(input);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

/** Thumbnail served by YouTube itself — no upload, no storage. */
export function toYouTubeThumbnail(input: string): string | null {
  const id = toYouTubeVideoId(input);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}
