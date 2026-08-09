import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api/errors";

/**
 * Request-level helpers shared by every route handler.
 */

/**
 * Best-effort client IP.
 *
 * Behind Nginx the socket address is always 127.0.0.1, so the real address has
 * to come from a forwarding header. `x-forwarded-for` is a comma-separated
 * chain and the **left-most** entry is the original client — but it is also
 * fully client-controlled, so anyone can prepend a fake address.
 *
 * That is acceptable for rate limiting (a spoofer only splits their own
 * budget) and for audit-log context. It is **not** acceptable as an
 * authorisation input: never gate access on this value. For it to be
 * trustworthy, Nginx must be configured to overwrite rather than append the
 * header.
 */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}

export function userAgent(request: NextRequest): string {
  return request.headers.get("user-agent")?.slice(0, 400) ?? "unknown";
}

/**
 * Parses a JSON body, converting the failure modes into clean 400s.
 *
 * Without this, a request with a trailing comma throws a raw `SyntaxError`
 * that surfaces as a 500 — telling the client "our fault" when it was theirs.
 */
export async function readJson(request: NextRequest): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw ApiError.badRequest("Expected Content-Type: application/json");
  }

  try {
    return await request.json();
  } catch {
    throw ApiError.badRequest("Request body is not valid JSON");
  }
}

/** Query string as a plain object, so Zod can coerce and validate it. */
export function searchParamsToObject(request: NextRequest): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};

  for (const key of new Set(request.nextUrl.searchParams.keys())) {
    const values = request.nextUrl.searchParams.getAll(key);
    result[key] = values.length > 1 ? values : (values[0] ?? "");
  }

  return result;
}
