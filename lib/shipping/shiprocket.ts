import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/api/errors";
import { shiprocketConfig } from "@/config/env";

/**
 * Shiprocket.
 *
 * One module owns the HTTP contract; services above it pass domain objects and
 * receive domain objects. Nothing outside this file knows that Shiprocket
 * quotes weights in kilograms, dimensions in centimetres, and money in
 * **rupees** rather than paise.
 *
 * That last one deserves emphasis, because it is the bug that survives review:
 * every amount in this codebase is integer paise, and every amount Shiprocket
 * accepts is a rupee float. The conversion happens exactly once, at the payload
 * builder in this file, via `toRupees`. Sending paise to Shiprocket declares a
 * ₹50,000 necklace at ₹50,00,000 and the insurance premium follows.
 *
 * ## Authentication
 *
 * Login returns a bearer token valid for **ten days**. The previous storefront
 * pasted one into `NEXT_PUBLIC_SHIPROCKET_ID` and read it in the browser, which
 * meant the token was public and shipping silently broke every ten days. Here
 * it is fetched on demand, cached in process, and re-fetched on a 401.
 */

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

const BASE_URL = "https://apiv2.shiprocket.in/v1/external";

function config() {
  const resolved = shiprocketConfig();

  if (!resolved) {
    throw ApiError.serviceUnavailable(
      "Shipping is not configured. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD.",
    );
  }

  return resolved;
}

type CachedToken = { token: string; expiresAtMs: number };

let cachedToken: CachedToken | null = null;

/**
 * Refresh a day early.
 *
 * The stated lifetime is ten days but the response does not carry an expiry, so
 * this is a local assumption rather than a reading of the token. A day of slack
 * means a wrong assumption degrades into an extra login, not a failed shipment.
 */
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000;

export function invalidateTokenCache(): void {
  cachedToken = null;
}

async function authToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAtMs > Date.now()) {
    return cachedToken.token;
  }

  const { email, password } = config();

  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  const payload = (await safeJson(response)) as { token?: string; message?: string };

  if (!response.ok || !payload.token) {
    throw ApiError.serviceUnavailable(
      "Could not reach the shipping provider.",
      new Error(
        `Shiprocket login failed (${response.status}): ${payload.message ?? "no token returned"}`,
      ),
    );
  }

  cachedToken = { token: payload.token, expiresAtMs: Date.now() + TOKEN_TTL_MS };

  return payload.token;
}

async function request<T>(
  path: string,
  init: { method: "GET" | "POST" | "PATCH"; body?: unknown },
  retry = true,
): Promise<T> {
  const token = await authToken();

  const response = await fetch(`${BASE_URL}${path}`, {
    method: init.method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });

  if (response.status === 401 && retry) {
    invalidateTokenCache();
    return request<T>(path, init, false);
  }

  const payload = await safeJson(response);

  if (!response.ok) {
    const detail = payload as { message?: string; errors?: unknown };

    /**
     * 422 means Shiprocket understood the request and rejected its contents —
     * an unregistered pickup location, a pincode it does not serve, a missing
     * HSN. That is actionable by an operator, so the detail is surfaced rather
     * than flattened into a generic 503.
     */
    if (response.status === 422 || response.status === 400) {
      throw ApiError.badRequest(
        `Shiprocket rejected the shipment: ${detail.message ?? JSON.stringify(detail.errors ?? payload)}`,
      );
    }

    throw ApiError.serviceUnavailable(
      "The shipping provider is unavailable. Please try again.",
      new Error(`Shiprocket ${init.method} ${path} → ${response.status} ${JSON.stringify(payload)}`),
    );
  }

  return payload as T;
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 300) };
  }
}

/** Paise → rupees, the only place this conversion is allowed to happen. */
function toRupees(paise: number): number {
  return Math.round(paise) / 100;
}

// ---------------------------------------------------------------------------
// Serviceability
// ---------------------------------------------------------------------------

export type ServiceabilityQuery = {
  deliveryPincode: string;
  pickupPincode?: string;
  weightKg?: number;
  declaredValuePaise: number;
  cod?: boolean;
};

export type CourierQuote = {
  courierId: number;
  courierName: string;
  /** Shipping cost quoted to us, in paise. */
  ratePaise: number;
  estimatedDays: number | null;
  estimatedDeliveryDate: string | null;
  rating: number | null;
  isSurface: boolean;
};

export type Serviceability = {
  serviceable: boolean;
  couriers: CourierQuote[];
  /** Cheapest quote, which is what the storefront shows. */
  cheapest: CourierQuote | null;
  fastest: CourierQuote | null;
};

/**
 * Asks whether a pincode can be delivered to, before the customer pays.
 *
 * Checking at the address step rather than after payment is the whole point.
 * Discovering at fulfilment that nobody serves a pincode means refunding a
 * completed order and telling a customer their jewellery is not coming —
 * expensive, and entirely avoidable with one call.
 */
export async function checkServiceability(
  query: ServiceabilityQuery,
): Promise<Serviceability> {
  const { pickupPincode, parcel } = config();
  const origin = query.pickupPincode ?? pickupPincode;

  if (!origin) {
    throw ApiError.serviceUnavailable(
      "No pickup pincode is configured. Set SHIPROCKET_PICKUP_PINCODE.",
    );
  }

  const params = new URLSearchParams({
    pickup_postcode: origin,
    delivery_postcode: query.deliveryPincode,
    cod: query.cod ? "1" : "0",
    weight: String(query.weightKg ?? parcel.weightKg),
    declared_value: String(toRupees(query.declaredValuePaise)),
  });

  type Response = {
    data?: {
      available_courier_companies?: Array<{
        courier_company_id: number;
        courier_name: string;
        rate: number;
        estimated_delivery_days?: string;
        etd?: string;
        rating?: number;
        is_surface?: boolean;
      }>;
    };
  };

  let payload: Response;

  try {
    payload = await request<Response>(`/courier/serviceability/?${params}`, { method: "GET" });
  } catch (error) {
    /**
     * Shiprocket answers "no courier serves this route" with a 404, which the
     * generic handler would turn into an error page. It is a legitimate
     * negative answer, so it becomes `serviceable: false` instead.
     */
    if (error instanceof ApiError && error.status === 404) {
      return { serviceable: false, couriers: [], cheapest: null, fastest: null };
    }
    throw error;
  }

  const couriers: CourierQuote[] = (payload.data?.available_courier_companies ?? []).map(
    (courier) => ({
      courierId: courier.courier_company_id,
      courierName: courier.courier_name,
      // `rate` is rupees; the rest of the system speaks paise.
      ratePaise: Math.round(courier.rate * 100),
      estimatedDays: courier.estimated_delivery_days
        ? Number.parseInt(courier.estimated_delivery_days, 10)
        : null,
      estimatedDeliveryDate: courier.etd ?? null,
      rating: courier.rating ?? null,
      isSurface: Boolean(courier.is_surface),
    }),
  );

  const withEta = couriers.filter((courier) => courier.estimatedDays != null);

  return {
    serviceable: couriers.length > 0,
    couriers,
    cheapest:
      couriers.length > 0
        ? couriers.reduce((best, c) => (c.ratePaise < best.ratePaise ? c : best))
        : null,
    fastest:
      withEta.length > 0
        ? withEta.reduce((best, c) => (c.estimatedDays! < best.estimatedDays! ? c : best))
        : null,
  };
}

// ---------------------------------------------------------------------------
// Order creation
// ---------------------------------------------------------------------------

export type ShipmentAddress = {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  email: string;
};

export type ShipmentItem = {
  name: string;
  sku: string;
  quantity: number;
  /** Unit selling price in paise. */
  unitPricePaise: number;
  discountPaise: number;
  taxPercent: number;
  hsnCode?: string;
};

export type CreateShipmentInput = {
  /** Our human-readable order number. Shiprocket requires it to be unique. */
  orderNumber: string;
  orderDate: Date;
  address: ShipmentAddress;
  items: ShipmentItem[];
  subtotalPaise: number;
  shippingChargePaise: number;
  discountPaise: number;
  /** `Prepaid` for anything already paid through PhonePe. */
  paymentMethod: "Prepaid" | "COD";
  weightKg?: number;
  dimensionsCm?: { length: number; breadth: number; height: number };
};

export type CreateShipmentResult = {
  shiprocketOrderId: string;
  shipmentId: string;
  status: string;
  raw: unknown;
};

export async function createShipmentOrder(
  input: CreateShipmentInput,
): Promise<CreateShipmentResult> {
  const { channelId, pickupLocation, parcel } = config();
  const dimensions = input.dimensionsCm ?? {
    length: parcel.lengthCm,
    breadth: parcel.breadthCm,
    height: parcel.heightCm,
  };

  const payload = {
    order_id: input.orderNumber,
    // Shiprocket parses this exact format. `toISOString().slice(0,10)` gives
    // UTC, which rolls an 11pm IST order back to the previous day on the
    // manifest — hence the explicit Asia/Kolkata formatting.
    order_date: formatOrderDate(input.orderDate),
    pickup_location: pickupLocation,
    ...(channelId ? { channel_id: channelId } : {}),

    billing_customer_name: firstName(input.address.fullName),
    billing_last_name: lastName(input.address.fullName),
    billing_address: input.address.line1,
    billing_address_2: input.address.line2 ?? "",
    billing_city: input.address.city,
    billing_pincode: input.address.pincode,
    billing_state: input.address.state,
    billing_country: input.address.country || "India",
    billing_email: input.address.email,
    billing_phone: normalisePhone(input.address.phone),

    shipping_is_billing: true,

    order_items: input.items.map((item) => ({
      name: item.name.slice(0, 100),
      sku: item.sku,
      units: item.quantity,
      selling_price: toRupees(item.unitPricePaise),
      discount: toRupees(item.discountPaise),
      tax: item.taxPercent,
      // Shiprocket wants an HSN for jewellery on the commercial invoice.
      // Omitted rather than guessed — an invented code is a customs problem.
      ...(item.hsnCode ? { hsn: item.hsnCode } : {}),
    })),

    payment_method: input.paymentMethod,
    sub_total: toRupees(input.subtotalPaise),
    shipping_charges: toRupees(input.shippingChargePaise),
    total_discount: toRupees(input.discountPaise),
    giftwrap_charges: 0,
    transaction_charges: 0,

    length: dimensions.length,
    breadth: dimensions.breadth,
    height: dimensions.height,
    weight: input.weightKg ?? parcel.weightKg,
  };

  const response = await request<{
    order_id?: number | string;
    shipment_id?: number | string;
    status?: string;
    status_code?: number;
    message?: string;
  }>("/orders/create/adhoc", { method: "POST", body: payload });

  if (!response.order_id || !response.shipment_id) {
    throw ApiError.serviceUnavailable(
      "The shipping provider did not return a shipment reference.",
      new Error(`Shiprocket create response: ${JSON.stringify(response)}`),
    );
  }

  return {
    shiprocketOrderId: String(response.order_id),
    shipmentId: String(response.shipment_id),
    status: response.status ?? "NEW",
    raw: response,
  };
}

// ---------------------------------------------------------------------------
// AWB, pickup, documents
// ---------------------------------------------------------------------------

export type AwbResult = {
  awbCode: string;
  courierId: number;
  courierName: string;
  raw: unknown;
};

/**
 * Assigns a courier and an airway bill.
 *
 * With no `courierId`, Shiprocket picks by the account's own courier rules.
 * Passing one explicitly is how the cheapest quote from `checkServiceability`
 * is honoured — otherwise the quote shown to the customer and the courier
 * actually used can differ.
 */
export async function assignAwb(shipmentId: string, courierId?: number): Promise<AwbResult> {
  const response = await request<{
    response?: {
      data?: {
        awb_code?: string;
        courier_company_id?: number;
        courier_name?: string;
      };
    };
    message?: string;
  }>("/courier/assign/awb", {
    method: "POST",
    body: {
      shipment_id: Number(shipmentId),
      ...(courierId ? { courier_id: courierId } : {}),
    },
  });

  const data = response.response?.data;

  if (!data?.awb_code) {
    throw ApiError.serviceUnavailable(
      "Could not obtain an airway bill for this shipment.",
      new Error(`Shiprocket AWB response: ${JSON.stringify(response)}`),
    );
  }

  return {
    awbCode: data.awb_code,
    courierId: data.courier_company_id ?? courierId ?? 0,
    courierName: data.courier_name ?? "",
    raw: response,
  };
}

export async function schedulePickup(shipmentId: string): Promise<unknown> {
  return request("/courier/generate/pickup", {
    method: "POST",
    body: { shipment_id: [Number(shipmentId)] },
  });
}

export async function generateLabel(shipmentId: string): Promise<string | null> {
  const response = await request<{ label_url?: string }>("/courier/generate/label", {
    method: "POST",
    body: { shipment_id: [Number(shipmentId)] },
  });

  return response.label_url ?? null;
}

export async function generateInvoice(shiprocketOrderId: string): Promise<string | null> {
  const response = await request<{ invoice_url?: string }>("/orders/print/invoice", {
    method: "POST",
    body: { ids: [Number(shiprocketOrderId)] },
  });

  return response.invoice_url ?? null;
}

export async function cancelShipment(shiprocketOrderId: string): Promise<unknown> {
  return request("/orders/cancel", {
    method: "POST",
    body: { ids: [Number(shiprocketOrderId)] },
  });
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

export type TrackingScan = {
  status: string;
  description: string;
  location: string;
  occurredAt: Date;
};

export type Tracking = {
  awbCode: string;
  currentStatus: string;
  courierName: string;
  estimatedDeliveryAt: Date | null;
  deliveredAt: Date | null;
  trackingUrl: string | null;
  scans: TrackingScan[];
};

export async function trackByAwb(awbCode: string): Promise<Tracking> {
  const response = await request<{
    tracking_data?: {
      track_status?: number;
      shipment_track?: Array<{
        awb_code?: string;
        current_status?: string;
        courier_name?: string;
        edd?: string;
        delivered_date?: string;
      }>;
      shipment_track_activities?: Array<{
        date?: string;
        status?: string;
        activity?: string;
        location?: string;
      }>;
      track_url?: string;
    };
  }>(`/courier/track/awb/${encodeURIComponent(awbCode)}`, { method: "GET" });

  const data = response.tracking_data;
  const track = data?.shipment_track?.[0];

  return {
    awbCode: track?.awb_code ?? awbCode,
    currentStatus: track?.current_status ?? "UNKNOWN",
    courierName: track?.courier_name ?? "",
    estimatedDeliveryAt: parseDate(track?.edd),
    deliveredAt: parseDate(track?.delivered_date),
    trackingUrl: data?.track_url ?? null,
    scans: (data?.shipment_track_activities ?? []).map((scan) => ({
      status: scan.status ?? "",
      description: scan.activity ?? "",
      location: scan.location ?? "",
      occurredAt: parseDate(scan.date) ?? new Date(),
    })),
  };
}

// ---------------------------------------------------------------------------
// Webhook authentication
// ---------------------------------------------------------------------------

/**
 * Verifies the `x-api-key` header on a tracking webhook.
 *
 * Shiprocket's webhook auth is a static shared secret you type into their
 * dashboard — there is no signature over the body. So, exactly as with PhonePe,
 * a verified callback is a hint that something changed, not proof of what.
 * Tracking status is low-stakes enough to apply directly; anything that moves
 * money is re-read from the API.
 */
export function verifyWebhookToken(header: string | null): boolean {
  const { webhookToken } = config();

  if (!webhookToken) return false;
  if (!header) return false;

  // Hashed before comparison so the buffers are always the same length and
  // `timingSafeEqual` never throws on a wrong-length guess.
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(webhookToken).digest();

  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** `YYYY-MM-DD HH:mm`, in IST, which is what Shiprocket's parser expects. */
function formatOrderDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/**
 * Shiprocket requires a non-empty last name and rejects the order without one.
 * Customers with a single-word name are common, so it falls back to a full stop
 * rather than failing a legitimate order.
 */
function lastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(" ") : ".";
}

/** Shiprocket wants ten bare digits — no `+91`, no spaces. */
function normalisePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
