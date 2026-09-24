# API changelog

Every breaking change to a `/api/v1/*` response gets an entry here.

**Why this file exists:** the mobile app ships to app stores and users do not
upgrade on your schedule. Six months from now you will be serving a client
built against an older contract, and when it misbehaves this file is the first
place to look. `openapi.json` describes what the API is *today*; this describes
how it got there.

**What counts as breaking:** removing or renaming a field, changing a field's
type, changing the meaning of a value, removing an enum member, adding a
required request field, or tightening validation. Adding an optional response
field or a new enum member is not breaking.

---

## Unreleased

### 2026-09-24 — Public account-deletion request flow

Additive.

- **Added** `POST /auth/request-account-deletion` — body `{ email }`, no session required. If a matching, active customer account exists, emails a confirmation link valid for 30 minutes; responds `{ requested: true }` identically either way (same anti-enumeration shape as `forgot-password`).
- **Added** `POST /auth/confirm-account-deletion` — body `{ token }` from the emailed link. Soft-deletes the account, revokes every refresh token, and signs it out everywhere. `400` if the token is invalid, already used, or expired. Response `{ deleted: true }`.
- Backs the public "delete my account" page (`/delete-account` on the storefront), the URL app-store listings can point at for account-deletion requests.

### 2026-09-24 — Self-service account deletion

Additive.

- **Added** `DELETE /auth/delete-account` — soft-deletes the signed-in customer's own account, revokes every refresh token and clears session cookies. Storefront/app auth session required; staff accounts get 403 and must be removed by an admin instead. Response `{ deleted: true }`.

### 2026-09-19 — Product listing carries attributes

Additive.

- **Added** `attributes` (`gender`, `occasions`, `style`, `finish`, `certification`) to each item of `GET /products`. It was already on `GET /products/:slug`; the listing projection had dropped it, so a storefront grouping products by occasion saw none.
- **Fixed** `variants[].colour` on `GET /products` items — a `$variant.colour` / `$$variant.colour` typo in the projection returned it as `undefined` on every listing row.

### 2026-09-18 — Admin orders

Additive.

- **Added** `GET /admin/orders` (`order:read`) — paginated, `status` filter, `search` prefix on order number or customer email.
- **Added** `GET /admin/orders/:orderNumber` (`order:read`) — `{ order, payment, shipment, manualTransitions }`; `shipment.events` newest first.
- **Added** `POST /admin/orders/:orderNumber/status` (`order:write`) — body `{ status, note? }`, `status` one of `SHIPPED | OUT_FOR_DELIVERY | DELIVERED | RETURN_REQUESTED | RETURN_PICKED`. Runs the normal state machine (409 on an illegal move); DELIVERED sets `deliveredAt` and, for COD, marks the payment collected. Customer notifications fire as for courier events.

### 2026-09-18 — Footer assurance strip removed

- The storefront no longer renders the four assurance badges above the footer. `assurances` on `GET /settings` / `PATCH /admin/settings` is **retained but unused**; the admin editor for it is gone.

### 2026-09-18 — Contact page retired

- The storefront no longer has a `/contact` page. `/contact` is **removed** from the hero-slide destination list (`HERO_LINK_OPTIONS`); an existing slide pointing there shows as "Unavailable" in the admin and must be re-pointed. `helpLinks` and `helpPage.cards` defaults no longer include it.
- `contactPage` on `GET /settings` / `PATCH /admin/settings` is **retained but unused** by the storefront (kept for API compatibility; the admin tab that edited it is gone).

### 2026-09-18 — Footer help links

Additive.

- **Added** `helpPage` (`{ eyebrow, title, description, cards: [{ title, body, href, cta }] }`) to `GET /settings` and `PATCH /admin/settings` — the `/faq` page's header and the help cards beneath the questions. Same `href` rules as `helpLinks`; at most 6 cards.
- **Added** `helpLinks` (`[{ label, href, isActive, openInNewTab }]`, ordered) to `GET /settings` and `PATCH /admin/settings`. `href` must be a storefront path (`/faq`) or an absolute http(s) URL. Defaults to the seven links the storefront footer used to hard-code.

### 2026-09-17 — Recommendation signals

Additive.

- **Added** `GET /products/:slug/signals` — public. `{ coPurchased: [{productId, slug, count}], coViewed: [...], volume: { orders, visitors } }`. Co-purchase counts orders (last 180 days, paid statuses) containing both products; co-view counts distinct visitors (last 60 days) who opened both pages. Cached server-side for 5 minutes.

### 2026-09-17 — Product traffic

Additive.

- **Added** `POST /products/:slug/view` — public, unauthenticated beacon from the storefront product page. Body `{ visitorId, referrer? }`. Answers 202 with `{ recorded }`; repeat views by the same visitor within 30 minutes, unknown slugs and staff sessions are silently not recorded. Rows expire after 180 days.
- **Added** `traffic` to `GET /admin/stats` (views, unique visitors, daily series, most-viewed products with sales conversion, referrer hosts). `sales` on the same response is now `null` for roles without `order:read` instead of the route answering 403.

### 2026-09-17 — Cash on delivery

Additive. No existing contracts broken.

Orders (`POST /orders`):
- **Added** optional `paymentMethod` request field: `"PHONEPE"` (default) or `"COD"`. A COD order is returned already `CONFIRMED` (with a shipment booked when the courier is reachable) — there is no `/payments/phonepe/initiate` leg, and calling it for a COD order answers 409.
- **Added** `PENDING → CONFIRMED` as a legal order transition (COD only).
- COD is refused with 400 when the store switch is off or the computed total exceeds `settings.cod.maxOrderValuePaise` (default ₹50,000).

Shipping (`GET /shipping/serviceability`):
- **Added** `codAvailable` (boolean) and `codUnavailableReason` (string, only when false) to the response so the checkout can grey the option out with the reason instead of failing after the customer picks it.

Payments:
- A COD order carries a `Payment` row with `method: "COD"`, `status: "PENDING"` and `merchantTransactionId: "COD-<orderNumber>"`. It flips to `SUCCESS` (with `paymentInstrument: "CASH_ON_DELIVERY"`) when the courier reports delivery. The PhonePe reconciliation sweep ignores these rows.

### 2026-09-02 — Help footer navigation, dynamic store settings, and policy management

Additive. No existing contracts broken.

Settings shape (`/settings`, `/admin/settings`):
- **Added** `supportHours`, `footerBlurb`, `copyrightText`, `paymentMethodsNote`, `assurances`, `contactPage` (with physical `stores` list), and `faqs` (categories and question/answer pairs) to `GET /settings` and editable via `PATCH /admin/settings`.

Policies (`/policies/:slug`, `/admin/policies/:slug`):
- **Added** `privacy` and `terms` to supported policy slugs alongside `shipping` and `returns`. All four policy pages are now dynamic and editable via the admin console with seed fallbacks.

### 2026-09-02 — Product details: customizable shipping & returns and care instructions

Additive. No existing contracts broken.

Product shape:
- **Added** optional `shippingReturns` and `careInstructions` strings on `Product` for PDP-level policy and care guidance overrides. When omitted or null, storefronts fall back to default store-wide policies and stone-specific care instructions.

### 2026-08-09 — Fixed-price catalogue: variants lose their pricing inputs

**Breaking, extensively.** The store sells fixed-price 1-gram-gold pieces, not
bullion-priced gold, so prices are no longer derived from a live metal rate.
A price is now typed by an admin and stored on the **product**; a variant is a
stock row.

Removed endpoints — a client calling any of these gets a 404:

| Method | Path | Was |
| --- | --- | --- |
| `GET` | `/rates` | Current metal rates |
| `POST` | `/rates` | Record a rate, reprice the catalogue |
| `GET` | `/rates/{metal}/history` | Rate history |
| `POST` | `/admin/price-preview` | Live price preview for the editor |
| `POST` | `/admin/reprice` | Manual repricing sweep |

Product shape:

- **Removed** `priceFromPaise` and `priceToPaise`. **Added** `pricePaise` (the
  pre-tax price of one unit) and nullable `compareAtPricePaise`. A client
  rendering a price band must now render one figure.
- `GET /products/{slug}` **adds** `price`: the `PriceBreakdown` for the product,
  or `null` when it has no usable price. Variants no longer carry a `price` of
  their own — every variant of a product sells at the same figure.
- `PriceBreakdown` **loses** `metalRatePerGramPaise`, `metalValuePaise`,
  `wastageChargePaise`, `makingChargePaise`, `stoneValuePaise`,
  `hallmarkingChargePaise` and `isOverridden`. What remains is `subtotalPaise`,
  `gstPercent`, `gstPaise`, `totalPaise`.

Variant shape — **removed** `metal`, `grossWeightMg`, `netWeightMg`, `stones[]`,
`makingChargeType`, `makingChargeValue`, `wastagePercent`,
`hallmarkingChargePaise`, `fixedPriceOverridePaise`, `compareAtPricePaise`,
`huid` and `barcode`. **Added** required `colour`. What a variant now carries:
`sku`, `colour`, `size`, `stock`, `reservedStock`, `lowStockThreshold`,
`images`, `isActive`.

Listing query — `?metal=` and `?stone=` are **replaced** by `?colour=`. The
facet key in the response changes from `metals` to `colours`. `?minPrice` and
`?maxPrice` now range over `pricePaise`.

Order lines — the snapshot **loses** `metal`, `grossWeightMg`, `netWeightMg`,
`huid` and every rate-derived component, and **gains** `colour`. Money fields
(`unitPricePaise`, `lineSubtotalPaise`, `lineDiscountPaise`, `gstPercent`,
`lineGstPaise`, `lineTotalPaise`, `hsnCode`) are unchanged, so an invoice still
reconstructs. **Orders written before this change keep their old fields in the
database** — nothing rewrites history, but a client reading an old order will
not find `colour` on it.

Enums — `METALS`, `BASE_METALS`, `STONE_TYPES` and `MAKING_CHARGE_TYPES` are
gone. `colour` replaces them as the only variant axis besides size, and it is
**not** an enum: any string is accepted and normalised server-side to an
`UPPER_SNAKE` token, so `"Rose Gold"`, `"rose gold"` and `"rose-gold"` all store
and filter as `ROSE_GOLD`. `GOLD`, `ROSE_GOLD`, `SILVER`, `OXIDISED`,
`TWO_TONE`, `BLACK` and `MULTI` are the values the admin console suggests, but a
client must treat the field as open text — new tokens can appear at any time, so
do not switch exhaustively on it. `?colour=` takes the normalised token.

Migration note for existing data: products already in the database read back
with `pricePaise: 0`, are refused by the pricing engine and cannot be bought
until an admin sets a price. `GET /health` reports the count as
`unpricedProducts`, and the admin Overview warns about it. This is deliberate —
back-filling a price from a stale gold rate is the mistake this change exists
to prevent.

### 2026-08-08 — Checkout, payments and shipping

Additive. No existing endpoint changed, so nothing here breaks a shipped client.

New endpoints:

| Method | Path | Auth |
| --- | --- | --- |
| `POST` | `/orders` | customer |
| `GET` | `/orders` | customer |
| `GET` | `/orders/{orderNumber}` | customer |
| `POST` | `/orders/{orderNumber}/cancel` | customer |
| `GET` | `/orders/{orderNumber}/tracking` | customer |
| `POST` | `/payments/phonepe/initiate` | customer |
| `GET` | `/payments/phonepe/status/{merchantTransactionId}` | customer |
| `POST` | `/payments/phonepe/webhook` | PhonePe shared secret |
| `POST` | `/payments/reconcile` | staff `payment:read` |
| `GET` | `/shipping/serviceability` | public |
| `POST` | `/shipping/webhook` | Shiprocket shared secret |
| `POST` | `/admin/payments/refund` | staff `payment:refund` |
| `POST` | `/admin/orders/{orderNumber}/ship` | staff `shipment:write` |
| `POST` | `/admin/shipments/assign-courier` | staff `shipment:write` |

Contract notes clients must implement:

- **`POST /orders` accepts no amounts.** Send `productId`, `variantId` and
  `quantity` only. Every rupee — unit price, GST, coupon discount, shipping,
  grand total — is computed server-side from the live metal rate. A payload
  carrying a price is rejected as an unknown key, not silently ignored.
- **The PhonePe return URL is not proof of payment.** After the redirect, poll
  `/payments/phonepe/status/{merchantTransactionId}` until it reports `SUCCESS`
  or `FAILED`. That endpoint queries the gateway; the return URL is
  customer-controlled and confirms nothing.
- **Give up polling after about a minute.** A payment still `PENDING` is not
  lost — the reconciliation sweep settles it and the customer is emailed. Show
  "still confirming", not an error.
- **Order numbers are `DIVA-YYYYMMDD-NNNN`** and are the path parameter
  everywhere; ObjectIds are not accepted on order routes.
- Payment status enum: `INITIATED`, `PENDING`, `SUCCESS`, `FAILED`,
  `REFUND_INITIATED`, `REFUNDED`. Order status is the existing `OrderStatus`.

The two webhook routes authenticate with their provider's own shared secret and
carry no session. Do not call them from a client.

### 2026-08-07 — Initial `/api/v1`

First implementation. No prior contract to break.

Endpoints: health, auth (register, OTP verification, login, refresh, logout,
password reset, profile), public catalogue (products, categories, collections),
metal rates, admin catalogue CRUD, and Cloudinary upload signatures.

Three conventions clients must implement, all of which are expensive to retrofit:

- **All money is integer paise.** `129900` is ₹1,299.00. Never parse a monetary
  field as rupees, and never do float arithmetic on one.
- **All weights are integer milligrams.** Carats are `caratX100` — `75` is
  0.75ct.
- **Every response is enveloped:** `{ success: true, data, meta? }` or
  `{ success: false, error: { code, message, details? } }`. Branch on
  `error.code`; `error.message` is display text and gets reworded without
  notice.

Prices are **computed from the live metal rate on every read**, not stored. A
product's `priceFromPaise` is a denormalised search hint for sorting and range
filters — the authoritative price for a specific variant is the `price`
breakdown on the product-detail response, and the cart recomputes again at
checkout. A client that caches a price and re-displays it later will eventually
show a number the server will not honour.
