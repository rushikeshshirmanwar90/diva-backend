import type { NextRequest } from "next/server";
import { ok, created, paginationMeta } from "@/lib/api/response";
import { parseBody, parseQuery, parseParams } from "@/lib/api/validate";
import { clientIp, userAgent } from "@/lib/http/request";
import { slugParam, idParam } from "@/validators/common";
import {
  createProductSchema,
  updateProductSchema,
  listProductsSchema,
  updateStockSchema,
  createCategorySchema,
  updateCategorySchema,
  listCategoriesSchema,
  createCollectionSchema,
  updateCollectionSchema,
  uploadSignatureSchema,
  listMediaSchema,
  importImageSchema,
} from "@/validators/catalog";
import * as productService from "@/services/product.service";
import * as categoryService from "@/services/category.service";
import * as collectionService from "@/services/collection.service";
import * as uploadService from "@/services/upload.service";
import * as mediaService from "@/services/media.service";
import * as audit from "@/services/audit.service";
import { getPrincipal, requireStaff, type Principal } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/api/rate-limit";

/**
 * HTTP shaping for the catalogue.
 *
 * Controllers here do four things and nothing else: authenticate, validate,
 * delegate, and shape the response. No business rule and no database query
 * appears in this file — if a rule needs to change, it changes in the service.
 *
 * The recurring `isStaff` flag is what separates the public and admin views of
 * the same endpoint. A draft product is invisible to a shopper and visible to
 * an admin, and that is decided **here from the verified principal**, never
 * from a query parameter a caller could set.
 */

function auditContext(request: NextRequest, principal: Principal): audit.AuditContext {
  return {
    principal,
    ip: clientIp(request),
    userAgent: userAgent(request),
    requestId: request.headers.get("x-request-id") ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Products — public
// ---------------------------------------------------------------------------

export async function listProducts(request: NextRequest) {
  await enforceRateLimit("publicRead", clientIp(request));

  const query = parseQuery(request, listProductsSchema);
  const principal = await getPrincipal(request);
  const isStaff = Boolean(principal && principal.role !== "customer");

  const result = await productService.listProducts(query, { isStaff });

  return ok(result.items, {
    meta: {
      ...paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
      facets: result.facets,
    },
  });
}

export async function getProduct(request: NextRequest, params: unknown) {
  const { slug } = parseParams(params, slugParam);
  const principal = await getPrincipal(request);
  const isStaff = Boolean(principal && principal.role !== "customer");

  return ok(await productService.getProductBySlug(slug, { isStaff }));
}

// ---------------------------------------------------------------------------
// Products — admin
// ---------------------------------------------------------------------------

export async function createProduct(request: NextRequest) {
  const principal = await requireStaff(request, "catalog:write");
  const input = await parseBody(request, createProductSchema);

  const product = await productService.createProduct(input, principal.userId);

  audit.record(auditContext(request, principal), {
    action: "product.create",
    entityType: "Product",
    entityId: String(product._id),
    after: { title: product.title, slug: product.slug, status: product.status },
  });

  return created(product);
}

export async function updateProduct(request: NextRequest, params: unknown) {
  const principal = await requireStaff(request, "catalog:write");
  const { id } = parseParams(params, idParam);
  const input = await parseBody(request, updateProductSchema);

  const product = await productService.updateProduct(id, input);

  audit.record(auditContext(request, principal), {
    action: "product.update",
    entityType: "Product",
    entityId: id,
    after: input as Record<string, unknown>,
  });

  return ok(product);
}

export async function deleteProduct(request: NextRequest, params: unknown) {
  const principal = await requireStaff(request, "catalog:write");
  const { id } = parseParams(params, idParam);

  const result = await productService.deleteProduct(id);

  audit.record(auditContext(request, principal), {
    action: "product.delete",
    entityType: "Product",
    entityId: id,
  });

  return ok(result);
}

export async function updateStock(request: NextRequest, params: unknown) {
  const principal = await requireStaff(request, "catalog:write");
  const { id } = parseParams(params, idParam);
  const input = await parseBody(request, updateStockSchema);

  const result = await productService.updateStock(id, input.variantId, input.stock);

  audit.record(auditContext(request, principal), {
    action: "product.stock_update",
    entityType: "Product",
    entityId: id,
    after: { variantId: input.variantId, stock: input.stock },
  });

  return ok(result);
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listCategories(request: NextRequest) {
  const query = parseQuery(request, listCategoriesSchema);
  const principal = await getPrincipal(request);
  const isStaff = Boolean(principal && principal.role !== "customer");

  return ok(
    await categoryService.listCategories({
      ...query,
      // Inactive categories are staff-only regardless of what was asked for.
      includeInactive: isStaff && query.includeInactive,
    }),
  );
}

export async function getCategoryTree(request: NextRequest) {
  const principal = await getPrincipal(request);
  const isStaff = Boolean(principal && principal.role !== "customer");

  return ok(await categoryService.getCategoryTree({ includeInactive: isStaff }));
}

export async function getCategory(_request: NextRequest, params: unknown) {
  const { slug } = parseParams(params, slugParam);
  return ok(await categoryService.getCategoryBySlug(slug));
}

export async function createCategory(request: NextRequest) {
  const principal = await requireStaff(request, "catalog:write");
  const input = await parseBody(request, createCategorySchema);

  const category = await categoryService.createCategory(input);

  audit.record(auditContext(request, principal), {
    action: "category.create",
    entityType: "Category",
    entityId: category ? String(category._id) : undefined,
    after: { name: input.name },
  });

  return created(category);
}

export async function updateCategory(request: NextRequest, params: unknown) {
  const principal = await requireStaff(request, "catalog:write");
  const { id } = parseParams(params, idParam);
  const input = await parseBody(request, updateCategorySchema);

  const category = await categoryService.updateCategory(id, input);

  audit.record(auditContext(request, principal), {
    action: "category.update",
    entityType: "Category",
    entityId: id,
    after: input as Record<string, unknown>,
  });

  return ok(category);
}

export async function deleteCategory(request: NextRequest, params: unknown) {
  const principal = await requireStaff(request, "catalog:write");
  const { id } = parseParams(params, idParam);

  const result = await categoryService.deleteCategory(id);

  audit.record(auditContext(request, principal), {
    action: "category.delete",
    entityType: "Category",
    entityId: id,
  });

  return ok(result);
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export async function listCollections(request: NextRequest) {
  const principal = await getPrincipal(request);
  const isStaff = Boolean(principal && principal.role !== "customer");

  return ok(
    await collectionService.listCollections({
      includeInactive: isStaff,
      // The public sees only campaigns that are live right now.
      liveOnly: !isStaff,
    }),
  );
}

export async function getCollection(request: NextRequest, params: unknown) {
  const { slug } = parseParams(params, slugParam);
  const principal = await getPrincipal(request);
  const isStaff = Boolean(principal && principal.role !== "customer");

  return ok(await collectionService.getCollectionBySlug(slug, { isStaff }));
}

export async function createCollection(request: NextRequest) {
  const principal = await requireStaff(request, "catalog:write");
  const input = await parseBody(request, createCollectionSchema);

  const collection = await collectionService.createCollection(input);

  audit.record(auditContext(request, principal), {
    action: "collection.create",
    entityType: "Collection",
    entityId: collection ? String(collection._id) : undefined,
    after: { name: input.name },
  });

  return created(collection);
}

export async function updateCollection(request: NextRequest, params: unknown) {
  const principal = await requireStaff(request, "catalog:write");
  const { id } = parseParams(params, idParam);
  const input = await parseBody(request, updateCollectionSchema);

  const collection = await collectionService.updateCollection(id, input);

  audit.record(auditContext(request, principal), {
    action: "collection.update",
    entityType: "Collection",
    entityId: id,
    after: input as Record<string, unknown>,
  });

  return ok(collection);
}

export async function deleteCollection(request: NextRequest, params: unknown) {
  const principal = await requireStaff(request, "catalog:write");
  const { id } = parseParams(params, idParam);

  const result = await collectionService.deleteCollection(id);

  audit.record(auditContext(request, principal), {
    action: "collection.delete",
    entityType: "Collection",
    entityId: id,
  });

  return ok(result);
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

/**
 * Images the catalogue already uses, for reuse without re-uploading.
 *
 * `catalog:read` rather than `catalog:write`: browsing what exists is a read,
 * and support staff looking at an order should be able to see the same imagery
 * a customer does.
 */
export async function listMedia(request: NextRequest) {
  await requireStaff(request, "catalog:read");
  const query = parseQuery(request, listMediaSchema);

  return ok(await mediaService.listLibrary(query));
}

export async function importImage(request: NextRequest) {
  await requireStaff(request, "catalog:write");
  const input = await parseBody(request, importImageSchema);

  return ok(await mediaService.importByUrl(input));
}

export async function createUploadSignature(request: NextRequest) {
  const principal = await requireStaff(request, "catalog:write");
  const { folder } = parseQuery(request, uploadSignatureSchema);

  return ok(await uploadService.requestSignature(folder, principal.userId));
}
