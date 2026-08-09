import { NextResponse } from "next/server";
import { ApiError, ErrorCode, type ErrorCodeValue, type ErrorDetail } from "@/lib/api/errors";

/**
 * The single response envelope for every `/api/v1/*` endpoint.
 *
 *   { "success": true,  "data": … , "meta"?: … }
 *   { "success": false, "error": { "code", "message", "details"? } }
 *
 * One shape, always. The three clients — website, admin UI, mobile app — each
 * write their fetch wrapper once against this, and a new endpoint needs no new
 * parsing code. `success` is a discriminant, so TypeScript narrows the union
 * without anyone having to inspect the status code.
 */

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: PaginationMeta & Record<string, unknown>;
};

export type ApiFailure = {
  success: false;
  error: {
    code: ErrorCodeValue;
    message: string;
    details?: ErrorDetail[];
  };
};

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(
  data: T,
  init?: { status?: number; meta?: ApiSuccess<T>["meta"]; headers?: HeadersInit },
): NextResponse<ApiSuccess<T>> {
  const body: ApiSuccess<T> = { success: true, data };
  if (init?.meta) body.meta = init.meta;

  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: init?.headers,
  });
}

export function created<T>(data: T, headers?: HeadersInit): NextResponse<ApiSuccess<T>> {
  return ok(data, { status: 201, headers });
}

/**
 * 204 carries no body by design — returning `{success:true}` with a 204 is a
 * spec violation that some HTTP clients reject outright.
 */
export function noContent(headers?: HeadersInit): NextResponse<null> {
  return new NextResponse(null, { status: 204, headers }) as NextResponse<null>;
}

export function fail(
  status: number,
  code: ErrorCodeValue,
  message: string,
  details?: ErrorDetail[],
): NextResponse<ApiFailure> {
  const body: ApiFailure = { success: false, error: { code, message } };
  if (details?.length) body.error.details = details;

  return NextResponse.json(body, { status });
}

export function failFromApiError(error: ApiError): NextResponse<ApiFailure> {
  return fail(
    error.status,
    error.code,
    // 5xx messages may name internal hosts, drivers or query fragments. Clients
    // get a fixed string; the real message goes to the log with its stack.
    error.expose ? error.message : "Something went wrong. Please try again.",
    error.details,
  );
}

export function internalFailure(): NextResponse<ApiFailure> {
  return fail(
    500,
    ErrorCode.INTERNAL_ERROR,
    "Something went wrong. Please try again.",
  );
}

/** Builds pagination meta from the values a repository already computed. */
export function paginationMeta(input: {
  page: number;
  limit: number;
  total: number;
}): PaginationMeta {
  const totalPages = input.limit > 0 ? Math.ceil(input.total / input.limit) : 0;

  return {
    page: input.page,
    limit: input.limit,
    total: input.total,
    totalPages,
    hasNext: input.page < totalPages,
    hasPrev: input.page > 1,
  };
}
