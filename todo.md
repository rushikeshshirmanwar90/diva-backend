# Variant simplification — 1-gram-gold catalogue

We are not selling bullion-priced gold. Every piece is a fixed-price
1-gram-gold (plated/imitation) item, so the whole rate-driven pricing
apparatus goes away and a variant becomes a plain stock row.

## Target shape

**Variant** — exactly the five fields the admin types, plus two the system owns:

| Field | Notes |
| --- | --- |
| `colour` | open text, normalised to `UPPER_SNAKE`. Gold / Rose Gold / Silver / Oxidised / Two Tone / Black / Multi are suggested; anything else can be typed |
| `size` | free-form string, optional — ring size, chain length |
| `sku` | unique across the catalogue |
| `stock` | units on hand |
| `lowStockThreshold` | drives the inventory page's "low" badge |
| `reservedStock` | *system-owned* — units held by unpaid carts, never in the form |
| `isActive` | *system-owned toggle* — hides a discontinued colour without deleting SKU history |

Variant `images` are kept: a rose-gold piece needs its own photo, and that is
an image picker rather than one of the "fields" being trimmed.

**Product** gains the price that used to be computed:

- `pricePaise` — required, what one unit costs pre-tax
- `compareAtPricePaise` — nullable strike-through "was" price
- replaces `priceFromPaise` / `priceToPaise` / `pricedAt`

## Dropped entirely

From the variant: `metal`, `grossWeightMg`, `netWeightMg`, `stones[]`,
`makingChargeType`, `makingChargeValue`, `wastagePercent`,
`hallmarkingChargePaise`, `fixedPriceOverridePaise`, `compareAtPricePaise`
(moves to product), `huid`, `barcode`.

From the codebase: the metal-rate subsystem in full.

---

## Tasks

### 1. Models
- [x] `models/enums.ts` — drop `METALS`, `METAL_PURITY`, `METAL_BASE`,
      `BASE_METALS`, `STONE_TYPES`, `MAKING_CHARGE_TYPES`
- [x] `lib/colour.ts` — `COLOUR_SUGGESTIONS`, `toColourValue` (the normaliser)
      and `colourLabel`, shared by the validator, the console and the storefront
      so no two of them can disagree about what "Rose Gold" is stored as
- [x] `models/Product.ts` — reshape `Variant`, drop `stoneSchema` and the
      net-vs-gross `pre('validate')` hook, add `pricePaise` /
      `compareAtPricePaise`, rebuild the price indexes, drop the
      `variants.metal` and `variants.huid` indexes
- [x] `models/Order.ts` — line snapshot loses `metal`, weights, `huid` and every
      rate-derived component; gains `colour`. Keep `unitPricePaise`,
      `lineSubtotalPaise`, discount, GST, `hsnCode` — an invoice still needs those.
- [x] `models/MetalRate.ts` — delete
- [x] `models/index.ts` — drop the `MetalRateModel` export

### 2. Pricing engine
- [x] `lib/pricing/engine.ts` — `priceProduct({ pricePaise, gstPercent })`
      returning `{ subtotalPaise, gstPercent, gstPaise, totalPaise }`.
      `PricingError` stays, now thrown when a product has no positive price, so
      the "never sell something unpriceable" guarantee survives.
- [x] `lib/pricing/rates.ts` — delete (rate cache)
- [x] `services/product.service.ts` — no rate lookups; `refreshPrice` /
      `repriceAll` go away, variants are priced by their parent product
- [x] `services/order.service.ts` — price lines from `product.pricePaise`
- [x] `controllers/admin.controller.ts` — the price-preview endpoint

### 3. Metal-rate machinery removal
- [x] `repositories/metalRate.repository.ts`, `services/metalRate.service.ts` — delete
- [x] `controllers/catalog.controller.ts` — drop the three rate handlers
- [x] `app/api/v1/rates/**` — delete routes
- [x] `validators/catalog.ts` — drop `createMetalRateSchema`
- [x] `lib/openapi/registry.ts` — drop rate paths + reshape `PriceBreakdown`
- [x] `app/admin/(workspace)/metal-rates/` — delete page, drop the nav link
- [x] `app/api/v1/health/route.ts` — drop the `metalRates` probe

### 4. Validators / repositories / shipping
- [x] `validators/catalog.ts` — `variantInput` down to the five fields;
      `createProductSchema` / `updateProductSchema` take `pricePaise` +
      `compareAtPricePaise`; `listProductsSchema` swaps the `metal`/`stone`
      facets for `colour`
- [x] `validators/admin.ts` — price-preview input
- [x] `repositories/product.repository.ts` — sort/filter/facet on `pricePaise`;
      drop `findStalePriced` and `setDenormalisedPrice`
- [x] `services/shipping.service.ts` — parcel weight no longer comes from
      `grossWeightMg`; fall back to the configured flat parcel weight

### 5. Admin UI
- [x] `app/admin/_components/product-editor.tsx` — variant rows become
      colour / size / SKU / stock / low-stock; product price + compare-at added
      to the pricing card
- [x] `app/admin/_components/price-preview.tsx` — delete (nothing to preview
      once the price is typed directly)
- [x] `app/admin/(workspace)/products/page.tsx` — single price, not a band
- [x] `app/admin/(workspace)/inventory/page.tsx` — colour instead of metal
- [x] `app/admin/_lib/api.ts` — `Variant` / `Product` types

### 6. Verify
- [x] `npx tsc --noEmit`, `npx eslint`, `npm run build`
- [x] `npm run openapi:dump`
- [x] `CHANGELOG-API.md` — these are breaking API changes, they belong there
- [x] Report what breaks in `diva-frontend` (it consumes metal facets and the
      price band) — out of scope for this pass, but it must be listed

## Data migration

Existing product documents keep their old fields in MongoDB; nothing here
rewrites them. Any product already in the database will read back with
`pricePaise: 0` and be unpriceable until an admin sets a price. Flagged rather
than silently back-filled, because guessing a price from a stale gold rate is
exactly the mistake this change exists to prevent.
