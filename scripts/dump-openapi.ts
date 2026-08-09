/**
 * Writes the OpenAPI document to `openapi.json` at the project root.
 *
 *   npm run openapi:dump
 *
 * `GET /api/v1/openapi.json` serves the same document from a running server,
 * which is what the clients' `sync:types` scripts point at. This script exists
 * for CI, where booting the backend just to read a static contract is
 * unnecessary — and for diffing the contract in review without starting
 * anything.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildOpenApiDocument } from "@/lib/openapi/registry";

const target = resolve(process.cwd(), "openapi.json");

writeFileSync(target, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`);

console.info(`Wrote ${target}`);
