import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import mongoose from "mongoose";
import { ApiError, ErrorCode, isApiError, type ErrorDetail } from "@/lib/api/errors";
import { failFromApiError, internalFailure } from "@/lib/api/response";
import { connectToDatabase } from "@/lib/db/connect";
import { corsHeaders } from "@/lib/http/cors";
import { clientIp } from "@/lib/http/request";
import { isProduction } from "@/config/env";

/**
 * The wrapper every route handler goes through.
 *
 * It exists so that no individual route contains a try/catch. Error handling
 * that is re-implemented per route drifts: one endpoint leaks a stack trace,
 * another returns a bare string, a third returns 200 with an error inside. This
 * module is the single place where a thrown value becomes an HTTP response.
 *
 * Responsibilities, in order:
 *   1. Ensure the database is connected before the handler runs.
 *   2. Run the handler.
 *   3. Translate anything thrown into the standard envelope.
 *   4. Attach CORS and request-correlation headers to every outcome.
 *
 * Next 16 note: `context.params` is a Promise. Handlers receive the already-
 * awaited value, because forgetting that `await` is the single most common
 * Next 16 mistake and there is no reason to make every route re-learn it.
 */

export type RouteContext<P> = { params: Promise<P> };

export type HandlerArgs<P> = {
  request: NextRequest;
  params: P;
  requestId: string;
};

export type Handler<P> = (args: HandlerArgs<P>) => Promise<NextResponse> | NextResponse;

type RouteOptions = {
  /** Skip the DB connection for handlers that genuinely do not need it. */
  skipDatabase?: boolean;
};

export function route<P = Record<string, never>>(
  handler: Handler<P>,
  options: RouteOptions = {},
) {
  return async (request: NextRequest, context?: RouteContext<P>): Promise<NextResponse> => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const origin = request.headers.get("origin");
    const baseHeaders = { ...corsHeaders(origin), "X-Request-Id": requestId };

    try {
      if (!options.skipDatabase) {
        await connectToDatabase();
      }

      const params = ((await context?.params) ?? {}) as P;
      const response = await handler({ request, params, requestId });

      for (const [key, value] of Object.entries(baseHeaders)) {
        response.headers.set(key, value);
      }

      return response;
    } catch (error) {
      const response = toErrorResponse(error, { requestId, request });

      for (const [key, value] of Object.entries(baseHeaders)) {
        response.headers.set(key, value);
      }

      return response;
    }
  };
}

/** Preflight responder. Every route file with a mutation should export this. */
export function corsPreflight(request: NextRequest): NextResponse {
  // Imported lazily to keep this module's import graph small for GET-only routes.
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

// ---------------------------------------------------------------------------
// Error translation
// ---------------------------------------------------------------------------

function toErrorResponse(
  error: unknown,
  context: { requestId: string; request: NextRequest },
): NextResponse {
  const apiError = normalise(error);

  if (apiError.status >= 500) {
    // Full detail, server-side only. This is the one place a stack trace is
    // printed, and it carries the request id so a customer report ("I got an
    // error, the page said 3f2a…") maps to an exact log line.
    console.error(
      `[api] ${context.requestId} ${context.request.method} ${context.request.nextUrl.pathname} ` +
        `from ${clientIp(context.request)} — ${apiError.message}`,
      apiError.cause ?? apiError,
    );
  } else if (!isProduction) {
    console.warn(
      `[api] ${context.requestId} ${apiError.status} ${apiError.code}: ${apiError.message}`,
    );
  }

  return apiError.status >= 500 && isProduction
    ? internalFailure()
    : failFromApiError(apiError);
}

/**
 * Maps every error type this codebase can produce onto an `ApiError`.
 *
 * The driver-level cases matter: a duplicate-key error is the database telling
 * us a uniqueness rule was violated, which is a 409 the client can act on, not
 * a 500. Letting those fall through to a generic 500 is how "email already
 * registered" turns into "something went wrong".
 */
function normalise(error: unknown): ApiError {
  if (isApiError(error)) return error;

  if (error instanceof ZodError) {
    return ApiError.validation("The submitted data is invalid", zodDetails(error));
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const details: ErrorDetail[] = Object.entries(error.errors).map(([path, issue]) => ({
      path,
      message: issue.message,
    }));
    return ApiError.validation("The submitted data is invalid", details);
  }

  if (error instanceof mongoose.Error.CastError) {
    // Almost always a malformed ObjectId in the URL — a client mistake, 400.
    return ApiError.badRequest(`"${String(error.value)}" is not a valid ${error.path}`);
  }

  if (isDuplicateKeyError(error)) {
    const field = Object.keys(error.keyPattern ?? {})[0] ?? "value";
    return new ApiError(409, ErrorCode.CONFLICT, `That ${field} is already in use`, {
      details: [{ path: field, message: "Already exists" }],
    });
  }

  if (error instanceof mongoose.Error.MongooseServerSelectionError) {
    return ApiError.serviceUnavailable("The database is unreachable", error);
  }

  return ApiError.internal(
    error instanceof Error ? error.message : "Unexpected error",
    error,
  );
}

type DuplicateKeyError = { code: number; keyPattern?: Record<string, unknown> };

function isDuplicateKeyError(error: unknown): error is DuplicateKeyError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === 11000
  );
}

/**
 * Flattens Zod issues into field-level details the admin forms can render
 * inline. `path` is dotted (`variants.0.sku`) so a form library can map it
 * straight onto its field registry.
 */
export function zodDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}
