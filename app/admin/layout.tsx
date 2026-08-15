import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./admin.css";
import "./admin-extras.css";

/**
 * The admin console's own layout segment.
 *
 * Its fonts and stylesheet load only under `/admin`, so the API routes served by
 * this same process carry none of it. Cormorant Garamond for display type and
 * Jost for body — matching the storefront's design exactly.
 *
 * Self-hosted via `next/font/local` rather than `next/font/google`: the latter
 * fetches from fonts.googleapis.com at build/dev-server start, and on a
 * network that can't reach it (offline, a proxy, a locked-down VM) that fetch
 * hangs before falling back, stalling the *first request to any route* —
 * exactly the cost the root layout's own comment describes avoiding. The
 * `.woff2` files under `./fonts` are the latin/normal weights actually used
 * here, pulled once from the `@fontsource` packages (OFL-licensed, same
 * license text as Google's own hosting — see the `*-LICENSE.txt` files
 * alongside them) and committed, so no network round trip happens at all.
 */
const display = localFont({
  src: [
    { path: "./fonts/cormorant-300.woff2", weight: "300", style: "normal" },
    { path: "./fonts/cormorant-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/cormorant-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/cormorant-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-cormorant",
  display: "swap",
});

const sans = localFont({
  src: [
    { path: "./fonts/jost-300.woff2", weight: "300", style: "normal" },
    { path: "./fonts/jost-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jost-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-jost",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DIVA | Admin workspace",
  description: "Manage the DIVA catalogue, pricing, inventory and customers.",
  // The admin console must never be indexed, even if a hostname leaks.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#ffffff",
  userScalable: true,
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className={`admin-scope ${display.variable} ${sans.variable}`}>{children}</div>
  );
}
