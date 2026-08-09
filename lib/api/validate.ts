import type { NextRequest } from "next/server";
import type { ZodType } from "zod";
import { ApiError } from "@/lib/api/errors";
import { zodDetails } from "@/lib/api/handler";
import { readJson, searchParamsToObject } from "@/lib/http/request";

/**
 * Validation at the HTTP boundary.
 *
 * Nothing below this line ever sees an unvalidated value. That is not just
 * tidiness — it is the NoSQL-injection control. Passing a request object
 * straight into a Mongo filter lets a caller send `{"email": {"$gt": ""}}` and
 * match the first user in the collection, which is a complete auth bypass.
 * Zod-parsed output is primitives and known keys only, so there is no operator
 * object left to smuggle through.
 *
 * Every schema in `validators/` is `.strict()`, so unknown keys are rejected
 * rather than ignored. That blocks mass-assignment: a POST to
 * `/api/v1/auth/register` cannot carry `"role": "superadmin"` and have it
 * quietly reach the model.
 */

/** Parses and validates a JSON request body. */
export async function parseBody<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  const raw = await readJson(request);
  const result = schema.safeParse(raw);

  if (!result.success) {
    throw ApiError.validation("The submitted data is invalid", zodDetails(result.error));
  }

  return result.data;
}

/**
 * Parses and validates the query string.
 *
 * Query values are always strings, so the schemas use `z.coerce` for numbers
 * and booleans. Validation failures here are still 400s — a malformed `?page=`
 * is a client error, and defaulting it silently hides genuine client bugs.
 */
export function parseQuery<T>(request: NextRequest, schema: ZodType<T>): T {
  const result = schema.safeParse(searchParamsToObject(request));

  if (!result.success) {
    throw ApiError.validation("Invalid query parameters", zodDetails(result.error));
  }

  return result.data;
}

/** Validates route params (`/products/[id]`). */
export function parseParams<T>(params: unknown, schema: ZodType<T>): T {
  const result = schema.safeParse(params);

  if (!result.success) {
    throw ApiError.badRequest("Invalid URL parameters", zodDetails(result.error));
  }

  return result.data;
}
