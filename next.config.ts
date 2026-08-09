import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 *
 * These are the static ones. Anything that depends on the request (CORS, which
 * must echo the caller's origin) lives in `proxy.ts` instead — a static header
 * cannot vary per origin.
 *
 * Nginx should set these too in production. Duplication is intentional: if the
 * app is ever run without the reverse proxy in front of it, it stays hardened.
 */
const securityHeaders = [
  // Stops a browser from MIME-sniffing an uploaded file into something
  // executable — the classic "image that is actually HTML" XSS.
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Two years, preloadable. Only meaningful over HTTPS; harmless locally.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactCompiler: true,

  // Mongoose and the Mongo driver load native/optional deps that Turbopack
  // should not attempt to bundle for the server.
  serverExternalPackages: ["mongoose", "bcryptjs", "nodemailer"],

  images: {
    // `images.domains` is deprecated in Next 16 — remotePatterns is the
    // supported form and is stricter, since it pins the path prefix too.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // API responses are per-user and must never be cached by a CDN or
        // shared proxy. One customer seeing another's cart is the failure mode.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
    ];
  },
};

export default nextConfig;
