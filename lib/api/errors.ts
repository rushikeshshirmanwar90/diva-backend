/**
 * Application error codes.
 *
 * These are part of the public API contract: clients branch on `code`, never on
 * the human-readable `message`. Messages get reworded; codes must not. Adding a
 * code is backwards-compatible, renaming one is a breaking change and belongs
 * in CHANGELOG-API.md.
 */
export const ErrorCode = {
  // 400
  VALIDATION_ERROR: "VALIDATION_ERROR",
  BAD_REQUEST: "BAD_REQUEST",
  // 401
  UNAUTHENTICATED: "UNAUTHENTICATED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  // 403
  FORBIDDEN: "FORBIDDEN",
  // 404
  NOT_FOUND: "NOT_FOUND",
  // 409
  CONFLICT: "CONFLICT",
  // 422
  UNPROCESSABLE: "UNPROCESSABLE",
  // 429
  RATE_LIMITED: "RATE_LIMITED",
  // 500+
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Field-level detail, used mainly to render inline form errors. */
export type ErrorDetail = {
  path: string;
  message: string;
};

/**
 * The only error type route handlers should throw deliberately.
 *
 * Anything else reaching the handler wrapper is treated as an unexpected fault:
 * logged with a stack trace and reported to the client as a generic 500 with no
 * internals leaked.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCodeValue;
  readonly details?: ErrorDetail[];
  /** Marks errors that are safe to surface verbatim to end users. */
  readonly expose: boolean;

  constructor(
    status: number,
    code: ErrorCodeValue,
    message: string,
    options?: { details?: ErrorDetail[]; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    if (options?.details) this.details = options.details;
    this.expose = status < 500;

    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = "Malformed request", details?: ErrorDetail[]) {
    return new ApiError(400, ErrorCode.BAD_REQUEST, message, { details });
  }

  static validation(message = "Validation failed", details?: ErrorDetail[]) {
    return new ApiError(400, ErrorCode.VALIDATION_ERROR, message, { details });
  }

  static unauthenticated(message = "Authentication required") {
    return new ApiError(401, ErrorCode.UNAUTHENTICATED, message);
  }

  static forbidden(message = "You do not have access to this resource") {
    return new ApiError(403, ErrorCode.FORBIDDEN, message);
  }

  static notFound(message = "Resource not found") {
    return new ApiError(404, ErrorCode.NOT_FOUND, message);
  }

  static conflict(message = "Resource already exists") {
    return new ApiError(409, ErrorCode.CONFLICT, message);
  }

  static rateLimited(message = "Too many requests. Please try again shortly.") {
    return new ApiError(429, ErrorCode.RATE_LIMITED, message);
  }

  static internal(message = "Something went wrong", cause?: unknown) {
    return new ApiError(500, ErrorCode.INTERNAL_ERROR, message, { cause });
  }

  static serviceUnavailable(message = "Service temporarily unavailable", cause?: unknown) {
    return new ApiError(503, ErrorCode.SERVICE_UNAVAILABLE, message, { cause });
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
