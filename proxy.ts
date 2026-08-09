import { NextResponse, type NextRequest } from "next/server";
import { preflightHeaders } from "@/lib/http/cors";

/**
 * Next 16 renamed Middleware to Proxy: the file is `proxy.ts`, the export is
 * `proxy`, and it runs on the **Node.js runtime only** — the edge runtime is
 * not supported here. That last point is convenient rather than limiting, since
 * Node crypto and the Mongo driver are both available.
 *
 * Scope is kept deliberately narrow. Proxy runs before every matching request,
 * so anything slow here taxes the whole API. In particular it does **not**
 * verify sessions: authentication is resolved per route, at the service layer,
 * where it can be enforced rather than merely observed. Next's own guidance is
 * that proxy is for optimistic checks, not authorisation.
 *
 * What it does do:
 *   1. Answer CORS preflight requests, so no route file has to export OPTIONS.
 *   2. Stamp a request id used for log correlation end to end.
 */
export function proxy(request: NextRequest): NextResponse {
  const origin = request.headers.get("origin");

  // A preflight never reaches a route handler in a useful state — the browser
  // wants headers, not a body — so it terminates here.
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: preflightHeaders(origin) });
  }

  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Only the API surface. Admin pages and static assets are untouched, which
  // keeps proxy off the hot path for every CSS and image request.
  matcher: ["/api/:path*"],
};
