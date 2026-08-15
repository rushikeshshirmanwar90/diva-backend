"use client";

/**
 * The admin console's API client.
 *
 * The console is served by the same Next process that serves `/api/v1`, so
 * every call is same-origin. That buys two things: the session cookie is
 * attached without any CORS negotiation, and there is no bearer token to store
 * anywhere JavaScript can read it.
 *
 * What still has to be handled by hand is CSRF. Cookie authentication means the
 * browser attaches credentials to *any* request to this origin, including one
 * triggered from another site — so every mutation carries an `X-CSRF-Token`
 * header copied from the readable `diva_csrf` cookie. The server compares the
 * two. See lib/auth/csrf.ts for why that works.
 */

const BASE = "/api/v1";

export type ApiEnvelope<T> =
  | { success: true; data: T; meta?: Record<string, unknown> }
  | { success: false; error: { code: string; message: string; details?: { path: string; message: string }[] } };

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

/**
 * Carries the server's error code and field details up to the UI.
 *
 * Forms read `details` to place messages next to the right input — the server
 * already returns dotted paths like `variants.0.netWeightMg`, so re-deriving
 * that mapping in the client would be duplicated and would drift.
 */
export class AdminApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: { path: string; message: string }[];

  constructor(
    status: number,
    code: string,
    message: string,
    details: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** First message for a field path, for rendering inline. */
  fieldError(path: string): string | undefined {
    return this.details.find((detail) => detail.path === path)?.message;
  }
}

function readCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1];
}

const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type RequestOptions = { method?: string; body?: unknown; query?: Record<string, unknown> };

/** Requests that must never trigger a refresh — refreshing them is circular. */
function isAuthPath(path: string): boolean {
  return path.startsWith("/auth/refresh") || path.startsWith("/auth/login") || path.startsWith("/auth/logout");
}

/**
 * The in-flight refresh, shared by every caller that hits a 401 at once.
 *
 * A page that loads four lists in parallel produces four simultaneous 401s the
 * moment the access token lapses. Without this they would each POST
 * `/auth/refresh`, and because refresh tokens rotate, the first would invalidate
 * the token the other three are still holding — which the server correctly
 * treats as **token reuse** and punishes by revoking the whole family. The
 * result would be the opposite of what this code is for: a hard sign-out
 * triggered by nothing worse than a busy page.
 */
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const csrf = readCookie("diva_csrf");
      if (csrf) headers["X-CSRF-Token"] = csrf;

      const response = await fetch(new URL(`${BASE}/auth/refresh`, window.location.origin), {
        method: "POST",
        headers,
        credentials: "same-origin",
        body: JSON.stringify({ audience: "admin" }),
      });

      return response.ok;
    } catch {
      // Offline, or the server is down. Indistinguishable from an expired
      // session here, so treat it as a failed refresh and let the caller decide.
      return false;
    } finally {
      // Cleared regardless of outcome so the *next* 401 gets a fresh attempt
      // rather than replaying this one's stale answer forever.
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function redirectToLogin(): void {
  if (window.location.pathname.startsWith("/admin/login")) return;

  const next = encodeURIComponent(window.location.pathname + window.location.search);
  // A hard navigation on purpose, not a router.push. The session is gone, so the
  // whole client tree — cached route segments, in-memory form state, stale
  // lists — should be discarded and the server-side layout guard re-run from
  // scratch. A soft navigation would keep all of it.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `/admin/login?next=${next}`;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const method = options.method ?? "GET";

  const url = new URL(`${BASE}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }

  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  if (MUTATIONS.has(method)) {
    // Read per attempt, never hoisted: a refresh rotates the CSRF cookie, so a
    // replayed request must carry the new token, not the one that just expired.
    const csrf = readCookie("diva_csrf");
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }

  return fetch(url, {
    method,
    headers,
    // Same-origin rather than "include": there is no cross-origin case here, and
    // the narrower value means a misconfigured deploy cannot start leaking the
    // admin session to a third-party host.
    credentials: "same-origin",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

/**
 * One API call, with the 15-minute access token made invisible.
 *
 * Access tokens are deliberately short-lived; the session's real length is the
 * refresh token's. So a 401 is not "signed out" — it is routine, and the right
 * response is to refresh once and replay the request. The admin only sees the
 * login screen when the refresh itself fails, which means the session genuinely
 * ended.
 *
 * The previous behaviour redirected on the first 401, which threw away whatever
 * was typed into the page: a half-finished product, an edited variant row. That
 * is the same data loss as being signed out, every quarter of an hour.
 */
async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta?: Record<string, unknown> }> {
  let response = await send(path, options);

  if (response.status === 401 && !isAuthPath(path)) {
    if (await refreshSession()) {
      response = await send(path, options);
    }

    // Still refused after a successful refresh means the account itself lost
    // access — deactivated, or its role narrowed mid-session. Sending it back
    // through the login page is the only honest outcome.
    if (response.status === 401) redirectToLogin();
  }

  if (response.status === 204) {
    return { data: undefined as T };
  }

  let payload: ApiEnvelope<T>;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new AdminApiError(response.status, "INTERNAL_ERROR", "The server sent an unreadable response.");
  }

  if (!response.ok || !payload.success) {
    const error = payload.success ? undefined : payload.error;

    throw new AdminApiError(
      response.status,
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? "Something went wrong.",
      error?.details ?? [],
    );
  }

  return { data: payload.data, meta: payload.meta };
}

export const api = {
  get: <T>(path: string, query?: Record<string, unknown>) => request<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
  avatarUrl?: string;
};

export type DashboardStats = {
  catalogue: { total: number; active: number; draft: number; archived: number; variantCount: number };
  inventory: { lowStock: number; outOfStock: number; unitsOnHand: number; unitsReserved: number };
  taxonomy: { categories: number; collections: number };
  customers: { total: number; verified: number; newThisMonth: number };
  pricing: { unpriced: number };
  attention: {
    lowStockProducts: { id: string; title: string; slug: string; sku: string; available: number; threshold: number }[];
    draftProducts: { id: string; title: string; slug: string; updatedAt: string }[];
  };
};

export type ProductVariant = {
  _id: string;
  sku: string;
  colour: string;
  size?: string;
  stock: number;
  reservedStock: number;
  lowStockThreshold: number;
  images: ProductImage[];
  isActive: boolean;
};

export type ProductImage = {
  publicId: string;
  url: string;
  alt: string;
  width?: number;
  height?: number;
  displayOrder: number;
};

export type ProductListItem = {
  _id: string;
  title: string;
  slug: string;
  shortDescription?: string;
  images: ProductImage[];
  pricePaise: number;
  compareAtPricePaise?: number | null;
  ratingAvg: number;
  ratingCount: number;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  categoryIds: string[];
  soldCount: number;
  createdAt: string;
  inStock: boolean;
  variants: Pick<
    ProductVariant,
    "_id" | "sku" | "colour" | "size" | "stock" | "reservedStock" | "lowStockThreshold" | "isActive"
  >[];
};

export type ProductDetail = {
  _id: string;
  title: string;
  slug: string;
  shortDescription?: string;
  description?: string;
  categoryIds: string[];
  collectionIds: string[];
  brand: string;
  variants: ProductVariant[];
  images: ProductImage[];
  /** YouTube link — Shorts, watch or youtu.be. */
  videoUrl?: string | null;
  attributes: { gender?: string; occasions: string[]; style?: string; finish?: string; certification?: string };
  tags: string[];
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  isFeatured: boolean;
  isNewArrival: boolean;
  hsnCode?: string;
  gstPercent: number;
  pricePaise: number;
  compareAtPricePaise?: number | null;
  /** Null when the product has no usable price — the storefront hides the buy button. */
  price: { subtotalPaise: number; gstPercent: number; gstPaise: number; totalPaise: number } | null;
};

export type Category = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string | null;
  /**
   * Hero image for the storefront's category grid and landing page.
   *
   * Same `ImageRef` shape as a product image — one Cloudinary asset with its
   * `publicId`, so the asset can be replaced or deleted later rather than only
   * the URL being forgotten. `icon` is the cheap alternative for navigation,
   * where a full image round-trip is not worth it.
   */
  image?: ProductImage | null;
  /** Wide hero for the category landing page. Optional; `image` is the tile. */
  bannerImage?: ProductImage | null;
  icon?: string;
  displayOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  productCount: number;
};

/**
 * `/categories/tree` returns the same shape nested. Kept separate from
 * `Category` rather than adding an optional `children` to it — an optional
 * field that is always present on one endpoint and never on another forces a
 * needless null check at every use.
 */
export type CategoryNode = Category & { children: CategoryNode[] };

export type Collection = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  productIds: string[];
  displayOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
};

export type HeroCta = { label: string; href: string };

export type HeroSlide = {
  _id: string;
  heading: string;
  subtitle: string;
  image: ProductImage;
  cta: HeroCta;
  displayOrder: number;
  isActive: boolean;
};

export type RatesResponse = {
  rates: Record<string, number | undefined>;
  detail: { _id: string; ratePerGramPaise: number; effectiveAt: string }[];
  missing: string[];
};

export type RateHistoryEntry = {
  _id: string;
  metal: string;
  ratePerGramPaise: number;
  effectiveAt: string;
  note?: string;
  createdBy?: { name: string; email: string };
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  emailVerified: boolean;
  isActive: boolean;
  marketingOptIn: boolean;
  lastLoginAt?: string;
  createdAt: string;
};

export type UploadSignature = {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  uploadUrl: string;
  maxBytes: number;
  allowedFormats: string[];
};
