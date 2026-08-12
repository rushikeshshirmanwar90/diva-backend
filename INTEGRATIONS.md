# PhonePe & Shiprocket — provisioning guide

The code for both integrations is written and wired end to end. What is missing
is credentials. This is where each value comes from, what to register on each
dashboard, and how to prove it works before a customer touches it.

Verify at any point with:

```
npm run check:integrations
```

It authenticates against both providers for real, but only through calls that
cannot cost anything — an OAuth token fetch, a Shiprocket login, and one
read-only shipping quote. It is safe to run against production credentials.

---

## Where things live

| Concern | File |
| --- | --- |
| PhonePe HTTP contract | `lib/payments/phonepe.ts` |
| Shiprocket HTTP contract | `lib/shipping/shiprocket.ts` |
| Orchestration, settlement, refunds | `services/payment.service.ts` |
| Serviceability, shipment creation, tracking | `services/shipping.service.ts` |
| Env contract | `config/env.ts` |

Credentials exist **only in this project**. The storefront (`diva-frontend`)
holds none: the browser calls its own origin at `/api/bff/*`, which relays here
server-side. Anything named `NEXT_PUBLIC_*` is in the browser bundle and is
therefore public — that is how the previous storefront ended up publishing its
PhonePe salt key and Shiprocket token, and it is why nothing here uses that
prefix.

---

## PhonePe

This codebase speaks **Standard Checkout v2**, the OAuth product. It is not a
variant of the older `X-VERIFY` checksum API — different hosts, different auth,
different response shapes. `PHONEPE_MERCHANT_ID` and `PHONEPE_SALT_KEY` in
`config/env.ts` belong to that old flow and nothing reads them.

### 1. Get credentials

PhonePe Business dashboard → **Developer Settings → API Keys**.

| Value on the dashboard | Variable |
| --- | --- |
| Client ID | `PHONEPE_CLIENT_ID` |
| Client Secret | `PHONEPE_CLIENT_SECRET` |
| Client Version | `PHONEPE_CLIENT_VERSION` |

`PHONEPE_CLIENT_VERSION` is a *credential generation number*, not an API
version. It is `1` until you rotate the secret, then `2`. A stale value fails
OAuth with a generic 401 that says nothing about which field is wrong.

Sandbox and production issue **separate credentials** and are not
interchangeable. Set `PHONEPE_ENV=SANDBOX` while testing; switch to
`PRODUCTION` only after a sandbox payment has settled end to end, and swap the
client id and secret at the same time.

If the dashboard has no Developer Settings section, merchant onboarding is not
complete — that is an account matter with PhonePe, not a configuration one.

### 2. Register the webhook

Dashboard → **Developer Settings → Webhooks**. Set a username and password of
your choosing, then copy the same pair into `PHONEPE_WEBHOOK_USERNAME` and
`PHONEPE_WEBHOOK_PASSWORD`.

URL to register:

```
https://<APP_URL>/api/v1/payments/phonepe/webhook
```

PhonePe authenticates by sending `SHA256(username:password)` in the
`Authorization` header. Without both values the route rejects every delivery.
That refusal is correct and deliberate: a webhook that marks orders paid
without authenticating is a way to obtain jewellery for free.

The webhook must be publicly reachable. For local testing, tunnel it —
`ngrok http 4000` — and register the ngrok URL rather than `localhost`.

### 3. What a payment actually does

1. `POST /api/v1/payments/phonepe/initiate` writes a `Payment` row **before**
   calling PhonePe, so a crash mid-flight leaves a reconcilable record rather
   than an orphan charge.
2. The customer is sent to PhonePe, then returned to
   `<STOREFRONT_URL>/checkout/payment-return?ref=…`.
3. That page is treated as a **hint that the customer is back, and nothing
   more** — the URL is fully under their control. It polls
   `/api/v1/payments/phonepe/status/:id`, which re-reads the outcome from
   PhonePe.

So three things can settle an order: the webhook, the status poll, and the
reconciliation sweep. All funnel into one idempotent path.

### 4. Schedule the reconciliation sweep

```
POST /api/v1/payments/reconcile
```

Point a scheduler at it every five minutes. This is what rescues orders whose
webhook was never delivered, which is not a rare event — without it, those
customers have paid and receive nothing until somebody notices by hand.

It is staff-authenticated, so the scheduler needs a service account rather than
an open URL.

---

## Shiprocket

### 1. Create an API user

Shiprocket dashboard → **Settings → API → Configure → Create an API User**.

| Value | Variable |
| --- | --- |
| API user email | `SHIPROCKET_EMAIL` |
| API user password | `SHIPROCKET_PASSWORD` |

Use the API user, not your own dashboard login. The API user has no console
access, so leaking it cannot lose you the account.

Login returns a bearer token valid for ten days. It is fetched on demand and
cached in process — there is no token to paste anywhere, and nothing to rotate
every ten days.

### 2. Pickup address

**Settings → Company → Pickup Addresses.**

| Value | Variable |
| --- | --- |
| Pickup nickname | `SHIPROCKET_PICKUP_LOCATION` |
| Its pincode | `SHIPROCKET_PICKUP_PINCODE` |

The nickname must match **exactly, including case**. Shiprocket exposes no way
to verify it, and a mismatch is only rejected when the first real order is
created — so compare it against the dashboard by eye.

The pincode is separate because serviceability is quoted *before* an order
exists, so it cannot be read off one. Without it,
`/api/v1/shipping/serviceability` answers 503.

A new pickup address must be **verified** by Shiprocket before couriers will
quote against it. If `check:integrations` reports that no courier serves any
pincode, that is usually why.

### 3. Channel (optional)

`SHIPROCKET_CHANNEL_ID` files orders under a specific channel so web and mobile
sales are separable in Shiprocket's reports. Omitted, everything lands in the
default "Custom" channel.

### 4. Register the tracking webhook

Generate a shared secret:

```
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Put it in `SHIPROCKET_WEBHOOK_TOKEN` and in Shiprocket's webhook screen, then
register:

```
https://<APP_URL>/api/v1/shipping/webhook
```

Shiprocket echoes the secret as the `x-api-key` header. Without it, orders
still ship — customers just stop seeing live tracking.

### 5. Parcel defaults

`SHIPROCKET_DEFAULT_*` describe one jewellery box in centimetres and kilograms.
Couriers bill on volumetric weight, so these decide the quote whenever a
product carries no dimensions of its own. The shipped defaults (15 × 12 × 8 cm,
0.3 kg) are a guess at a padded box — measure yours.

### 6. HSN codes are per product, not config

`hsnCode` and `gstPercent` live on the product record and are set in the admin
console. GST defaults to 3%. HSN is deliberately **omitted rather than
guessed** when unset — an invented code on a commercial invoice is a customs
problem, not a cosmetic one.

Imitation and plated jewellery normally sits under the 7117 family, but confirm
the exact code with your accountant before entering it. Products without an HSN
still ship; their invoices are just incomplete.

---

## Carried over from the old storefront

The previous storefront (`diva_frontend`, the 2024 app) had a working
integration against the same merchant accounts. It has no `.env` on disk and
never committed one, so no credential survives — but several configuration
values were hardcoded in its source and are worth reusing.

### Reused

| Value | Where it was | Now |
| --- | --- | --- |
| Shiprocket channel `4854844` | `backend/shiprocket/addOrder.tsx` | `SHIPROCKET_CHANNEL_ID` |
| Pickup nickname `Primary` | same file | `SHIPROCKET_PICKUP_LOCATION` |
| GST 3% | `tax: "3"` on every line | `gstPercent` default on Product |
| Live domain `divatheindianjewel.com` | redirect + callback URLs | use for `APP_URL` / `STOREFRONT_URL` at go-live |

The channel id is only meaningful on the same Shiprocket account. If the shop
has since moved accounts, take a fresh one from the Channels page.

### Deliberately not reused

**The PhonePe salt key.** The old app authenticated with v1's `X-VERIFY`
checksum: a merchant id and a salt key. Standard Checkout v2 uses OAuth client
credentials instead. These are not two formats of the same secret — a salt key
cannot be converted into a client id and secret. You need new credentials from
Developer Settings regardless of what the old account holds.

**HSN `441122`.** The old app stamped this on every line item. Chapter 44 of
the HS schedule is *wood and articles of wood*, so it is either a placeholder
or a transcription error, and it was going onto commercial invoices. Do not
carry it forward. HSN is per product in the admin console now, and is omitted
rather than guessed when unset.

**Parcel dimensions 10 × 15 × 20 cm at 2.5 kg.** See the note in `.env.example`
— 2.5 kg on a jewellery box is very likely a placeholder, and Shiprocket bills
on the declared figure.

**The Shiprocket bearer token.** It lived in `NEXT_PUBLIC_SHIPROCKET_ID`, is
not on disk, and would have expired within ten days anyway. The new integration
logs in with an API user and manages tokens itself, so there is nothing to
paste.

### One thing to action

`diva_frontend/app/api/status/[id]/route.tsx` line 15 has a PhonePe salt key
committed in plain text:

```
const salt_key = 'de5e9ea0-e6f5-4eca-860b-6e3c25c30d3f';
```

That repository has a GitHub remote. If the merchant account still has this
salt active, treat it as leaked and rotate it in the PhonePe dashboard —
independently of this migration, and whether or not the old app is still
serving traffic. Rotating it does not affect the v2 credentials used here.

The same app also shipped `NEXT_PUBLIC_PHONEPE_SALT` and
`NEXT_PUBLIC_SHIPROCKET_ID` to the browser, so both were readable by anyone who
opened the JS bundle on the live site. Nothing in this project uses the
`NEXT_PUBLIC_` prefix for a credential, which is what prevents a repeat.

---

## Turning checkout on

1. Fill in both blocks in `.env`.
2. `npm run check:integrations` — green.
3. In `diva-frontend/.env.local`, set `NEXT_PUBLIC_CHECKOUT_ENABLED=true` and
   restart it.
4. Place a test order with a real address. Watch for: a serviceability quote on
   the address step, a redirect to PhonePe, a return to
   `/checkout/payment-return`, and the order reaching `PAYMENT_SUCCESS`.
5. Ship it from the admin console and confirm an AWB is assigned.

Until step 3, the storefront runs its click-through demo checkout, which needs
no backend at all — so the site stays presentable while the above is pending.

### Going live

- Swap PhonePe sandbox credentials for production ones **and** set
  `PHONEPE_ENV=PRODUCTION`. Changing one without the other fails OAuth.
- Set `APP_URL` and `STOREFRONT_URL` to real hostnames; the redirect and
  webhook URLs are built from them.
- Re-register both webhooks against the production URLs.
- Re-run `check:integrations` against production before taking real money.
