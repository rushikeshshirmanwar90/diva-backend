import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { buildOpenApiDocument } from "@/lib/openapi/registry";

/**
 * `GET /api/v1/openapi.json`
 *
 * The generated contract. `diva-frontend` and `diva` point `openapi-typescript`
 * at this URL to regenerate their committed API types.
 *
 * Returned raw rather than inside the standard envelope: OpenAPI tooling
 * expects the document at the root of the response, and wrapping it in
 * `{ success, data }` would break every generator.
 */
export const GET = route(
  async () => NextResponse.json(buildOpenApiDocument()),
  { skipDatabase: true },
);
