import type { Metadata } from "next";
import "./globals.css";

/**
 * The bare HTML shell every route renders inside — including `/admin`, which
 * layers its own fonts and stylesheet on top (see `app/admin/layout.tsx`).
 *
 * No `next/font/google` here. This app has no public-facing pages of its own
 * (it is the API plus the admin console), so there was never a page actually
 * rendering with Geist — `globals.css` hardcodes `font-family: Arial,
 * Helvetica, sans-serif` regardless. The import cost a network round trip to
 * Google Fonts on every dev-server cold start for a variable nothing read,
 * and an environment that cannot reach `fonts.googleapis.com` paid that cost
 * as a multi-second hang on the first request to *any* route, admin login
 * included, before Next gave up and fell back.
 */
export const metadata: Metadata = {
  title: "Diva API",
  description: "Diva backend: REST API and admin console.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
