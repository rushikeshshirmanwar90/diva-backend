import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { env } from "@/config/env";
import {
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  refreshSchema,
  updateProfileSchema,
} from "@/validators/auth";
import {
  createProductSchema,
  updateProductSchema,
  listProductsSchema,
  updateStockSchema,
  createCategorySchema,
  updateCategorySchema,
  createCollectionSchema,
  updateCollectionSchema,
  listMediaSchema,
  importImageSchema,
} from "@/validators/catalog";
import {
  createOrderSchema,
  listOrdersSchema,
  orderNumberParam,
  cancelOrderSchema,
  initiatePaymentSchema,
  merchantTransactionParam,
  refundSchema,
  serviceabilitySchema,
  assignCourierSchema,
} from "@/validators/checkout";

/**
 * OpenAPI document, generated from the Zod validators.
 *
 * This is the mechanism that keeps three independent repositories from drifting
 * apart. Because there is no monorepo and no shared package, the storefront and
 * the mobile app each hold their own copy of every API type — and hand-copied
 * types cannot catch a rename, since each copy stays internally consistent
 * while being wrong.
 *
 * The document below is built from **the same schemas that validate incoming
 * requests**. It cannot describe a shape the server does not actually accept,
 * because it *is* the validator. The clients then run:
 *
 *     npm run sync:types
 *
 * which regenerates a committed `api.generated.ts`. A breaking backend change
 * therefore shows up as a red diff in two other repositories at review time,
 * rather than as `₹NaN` on a product card in production.
 */

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

// --- Reusable components ---------------------------------------------------

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "Mobile clients. Web clients use the httpOnly session cookie instead.",
});

registry.registerComponent("securitySchemes", "cookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "diva_at",
  description: "Storefront session. Admin uses `diva_admin_at`.",
});

const errorSchema = registry.register(
  "ApiError",
  z
    .object({
      success: z.literal(false),
      error: z.object({
        code: z.string(),
        message: z.string(),
        details: z
          .array(z.object({ path: z.string(), message: z.string() }))
          .optional(),
      }),
    })
    .openapi("ApiError"),
);

const paginationMetaSchema = registry.register(
  "PaginationMeta",
  z
    .object({
      page: z.number().int(),
      limit: z.number().int(),
      total: z.number().int(),
      totalPages: z.number().int(),
      hasNext: z.boolean(),
      hasPrev: z.boolean(),
    })
    .openapi("PaginationMeta"),
);

/**
 * The price breakdown returned with a product.
 *
 * Registered explicitly because it is the shape clients most need to get right:
 * a client that renders only `totalPaise` cannot show a customer which part of
 * the number is tax.
 */
registry.register(
  "PriceBreakdown",
  z
    .object({
      subtotalPaise: z.number().int(),
      gstPercent: z.number(),
      gstPaise: z.number().int(),
      totalPaise: z.number().int(),
    })
    .openapi("PriceBreakdown", {
      description:
        "All amounts are integer paise. 129900 is ₹1,299.00. Never parse these as rupees.",
    }),
);

const errorResponses = {
  400: { description: "Validation failed", content: { "application/json": { schema: errorSchema } } },
  401: { description: "Not authenticated", content: { "application/json": { schema: errorSchema } } },
  403: { description: "Not permitted", content: { "application/json": { schema: errorSchema } } },
  404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  409: { description: "Conflict", content: { "application/json": { schema: errorSchema } } },
  429: { description: "Rate limited", content: { "application/json": { schema: errorSchema } } },
};

function jsonBody(schema: z.ZodType) {
  return { body: { content: { "application/json": { schema } } } };
}

function okResponse(description: string, schema: z.ZodType = z.unknown()) {
  return {
    200: {
      description,
      content: {
        "application/json": {
          schema: z.object({ success: z.literal(true), data: schema }),
        },
      },
    },
  };
}

// --- Paths -----------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Liveness and readiness, including a real database ping",
  responses: okResponse("Service is healthy"),
});

// Auth
const authPaths: [string, string, z.ZodType, string][] = [
  ["/auth/register", "post", registerSchema, "Create an account and send a verification code"],
  ["/auth/verify-otp", "post", verifyOtpSchema, "Verify the emailed code and start a session"],
  ["/auth/resend-otp", "post", resendOtpSchema, "Resend the verification code"],
  ["/auth/login", "post", loginSchema, "Sign in"],
  ["/auth/refresh", "post", refreshSchema, "Rotate the refresh token"],
  ["/auth/forgot-password", "post", forgotPasswordSchema, "Send a password-reset link"],
  ["/auth/reset-password", "post", resetPasswordSchema, "Set a new password from a reset link"],
];

for (const [path, method, schema, summary] of authPaths) {
  registry.registerPath({
    method: method as "post",
    path,
    tags: ["Auth"],
    summary,
    request: jsonBody(schema),
    responses: { ...okResponse(summary), ...errorResponses },
  });
}

registry.registerPath({
  method: "post",
  path: "/auth/change-password",
  tags: ["Auth"],
  summary: "Change password; ends every existing session",
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  request: jsonBody(changePasswordSchema),
  responses: { ...okResponse("Password changed"), ...errorResponses },
});

registry.registerPath({
  method: "get",
  path: "/auth/me",
  tags: ["Auth"],
  summary: "The signed-in user's profile",
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  responses: { ...okResponse("Profile"), ...errorResponses },
});

registry.registerPath({
  method: "patch",
  path: "/auth/me",
  tags: ["Auth"],
  summary: "Update the signed-in user's profile",
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  request: jsonBody(updateProfileSchema),
  responses: { ...okResponse("Updated profile"), ...errorResponses },
});

// Catalogue
registry.registerPath({
  method: "get",
  path: "/products",
  tags: ["Catalogue"],
  summary: "List products with filters, sorting and facet counts",
  request: { query: listProductsSchema },
  responses: {
    200: {
      description: "A page of products, with facet counts in `meta`",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(true),
            data: z.array(z.unknown()),
            meta: paginationMetaSchema.and(z.object({ facets: z.unknown() })),
          }),
        },
      },
    },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/products/{slug}",
  tags: ["Catalogue"],
  summary: "Product detail, with a live price breakdown per variant",
  request: { params: z.object({ slug: z.string() }) },
  responses: { ...okResponse("Product detail"), ...errorResponses },
});

registry.registerPath({
  method: "get",
  path: "/categories",
  tags: ["Catalogue"],
  summary: "List categories",
  responses: okResponse("Categories"),
});

registry.registerPath({
  method: "get",
  path: "/categories/tree",
  tags: ["Catalogue"],
  summary: "Nested category tree for navigation",
  responses: okResponse("Category tree"),
});

registry.registerPath({
  method: "get",
  path: "/collections",
  tags: ["Catalogue"],
  summary: "List collections that are live now",
  responses: okResponse("Collections"),
});

// Admin
const adminPaths: [string, "post" | "patch", z.ZodType, string][] = [
  ["/admin/products", "post", createProductSchema, "Create a product with variants"],
  ["/admin/products/{id}", "patch", updateProductSchema, "Update a product"],
  ["/admin/products/{id}/stock", "patch", updateStockSchema, "Set a variant's stock level"],
  ["/admin/categories", "post", createCategorySchema, "Create a category"],
  ["/admin/categories/{id}", "patch", updateCategorySchema, "Update a category"],
  ["/admin/collections", "post", createCollectionSchema, "Create a collection"],
  ["/admin/collections/{id}", "patch", updateCollectionSchema, "Update a collection"],
];

for (const [path, method, schema, summary] of adminPaths) {
  registry.registerPath({
    method,
    path,
    tags: ["Admin"],
    summary,
    security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    ...(path.includes("{id}") ? { request: { params: z.object({ id: z.string() }), ...jsonBody(schema) } } : { request: jsonBody(schema) }),
    responses: { ...okResponse(summary), ...errorResponses },
  });
}

registry.registerPath({
  method: "post",
  path: "/uploads/signature",
  tags: ["Admin"],
  summary: "Short-lived signature for a direct-to-Cloudinary upload",
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  responses: { ...okResponse("Upload signature"), ...errorResponses },
});

registry.registerPath({
  method: "get",
  path: "/admin/media",
  tags: ["Admin"],
  summary: "Images the catalogue already uses, for reuse without re-uploading",
  description:
    "Assembled from products, categories and collections — not from Cloudinary. " +
    "Listing an account's assets needs the Admin API secret; `cloudBrowsingAvailable` " +
    "reports whether that is configured.",
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  request: { query: listMediaSchema },
  responses: { ...okResponse("Media library"), ...errorResponses },
});

registry.registerPath({
  method: "post",
  path: "/admin/media/import",
  tags: ["Admin"],
  summary: "Attach an existing Cloudinary image by pasting its delivery URL",
  description:
    "Restricted to the store's own cloud on res.cloudinary.com. The asset is not " +
    "verified to exist — that requires the Admin API secret — so the client must " +
    "preview it before saving.",
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  request: jsonBody(importImageSchema),
  responses: { ...okResponse("An attachable image"), ...errorResponses },
});

// --- Checkout, payments, shipping ------------------------------------------

/**
 * Note what `createOrderSchema` does not contain: any amount at all. The
 * generated client therefore *cannot* send a price, which is the contract this
 * whole flow depends on — every rupee is computed server-side from the price
 * stored on the product.
 */
registry.registerPath({
  method: "post",
  path: "/orders",
  tags: ["Checkout"],
  summary: "Create a PENDING order and hold stock. Prices are computed server-side.",
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  request: jsonBody(createOrderSchema),
  responses: { ...okResponse("The created order"), ...errorResponses },
});

registry.registerPath({
  method: "get",
  path: "/orders",
  tags: ["Checkout"],
  summary: "The signed-in customer's order history",
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  request: { query: listOrdersSchema },
  responses: { ...okResponse("A page of orders"), ...errorResponses },
});

registry.registerPath({
  method: "get",
  path: "/orders/{orderNumber}",
  tags: ["Checkout"],
  summary: "One order. Another customer's order number returns 404, not 403.",
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  request: { params: orderNumberParam },
  responses: { ...okResponse("Order detail"), ...errorResponses },
});

registry.registerPath({
  method: "post",
  path: "/orders/{orderNumber}/cancel",
  tags: ["Checkout"],
  summary: "Cancel before dispatch. Releases stock; does not refund.",
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  request: { params: orderNumberParam, ...jsonBody(cancelOrderSchema) },
  responses: { ...okResponse("The cancelled order"), ...errorResponses },
});

registry.registerPath({
  method: "get",
  path: "/orders/{orderNumber}/tracking",
  tags: ["Shipping"],
  summary: "Courier tracking events for an order",
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  request: { params: orderNumberParam },
  responses: { ...okResponse("Tracking timeline"), ...errorResponses },
});

registry.registerPath({
  method: "post",
  path: "/payments/phonepe/initiate",
  tags: ["Payments"],
  summary: "Start a PhonePe Standard Checkout payment; returns a redirectUrl",
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  request: jsonBody(initiatePaymentSchema),
  responses: {
    ...okResponse(
      "Send the browser to `redirectUrl`. Do not treat the return trip as proof of payment.",
      z.object({
        merchantTransactionId: z.string(),
        redirectUrl: z.url(),
        orderNumber: z.string(),
        amountPaise: z.number().int(),
      }),
    ),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/payments/phonepe/status/{merchantTransactionId}",
  tags: ["Payments"],
  summary: "Live payment status, read from the gateway. Poll this after the redirect.",
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  request: { params: merchantTransactionParam },
  responses: { ...okResponse("Payment status"), ...errorResponses },
});

registry.registerPath({
  method: "get",
  path: "/shipping/serviceability",
  tags: ["Shipping"],
  summary: "Whether a pincode can be delivered to, and the shipping charge",
  request: { query: serviceabilitySchema },
  responses: { ...okResponse("Serviceability"), ...errorResponses },
});

/**
 * The webhooks are documented but carry no security scheme, because neither
 * uses ours. Each authenticates with its provider's own shared-secret header.
 * They are listed so nobody wires a client against them by mistake.
 */
registry.registerPath({
  method: "post",
  path: "/payments/phonepe/webhook",
  tags: ["Webhooks"],
  summary: "PhonePe callback. Authenticated by SHA256(username:password), not by session.",
  responses: okResponse("Acknowledged"),
});

registry.registerPath({
  method: "post",
  path: "/shipping/webhook",
  tags: ["Webhooks"],
  summary: "Shiprocket tracking callback. Authenticated by the x-api-key shared secret.",
  responses: okResponse("Acknowledged"),
});

registry.registerPath({
  method: "post",
  path: "/admin/payments/refund",
  tags: ["Admin"],
  summary: "Refund a captured payment, fully or in part. Requires payment:refund.",
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  request: jsonBody(refundSchema),
  responses: { ...okResponse("Refund initiated"), ...errorResponses },
});

registry.registerPath({
  method: "post",
  path: "/admin/shipments/assign-courier",
  tags: ["Admin"],
  summary: "Assign a courier, obtain the AWB and book the pickup",
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  request: jsonBody(assignCourierSchema),
  responses: { ...okResponse("Shipment with AWB"), ...errorResponses },
});

// --- Document --------------------------------------------------------------

export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "DIVA API",
      version: "1.0.0",
      description: [
        "REST API for the DIVA jewellery platform.",
        "",
        "**Money:** every amount is an integer count of paise. `129900` is ₹1,299.00.",
        "",
        "**Envelope:** every response is `{ success, data, meta? }` or",
        "`{ success: false, error: { code, message, details? } }`. Branch on `error.code`,",
        "never on `error.message` — messages get reworded, codes do not.",
        "",
        "**Auth:** mobile sends `Authorization: Bearer`. Browsers use httpOnly cookies",
        "and must also send `X-CSRF-Token` on mutations.",
      ].join("\n"),
    },
    servers: [{ url: `${env.APP_URL}/api/v1` }],
    tags: [
      { name: "System" },
      { name: "Auth" },
      { name: "Catalogue" },
      { name: "Pricing" },
      { name: "Checkout" },
      { name: "Payments" },
      { name: "Shipping" },
      { name: "Webhooks" },
      { name: "Admin" },
    ],
  });
}
