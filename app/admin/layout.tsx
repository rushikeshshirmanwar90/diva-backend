import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import "./admin.css";
import "./admin-extras.css";

/**
 * The admin console's own layout segment.
 *
 * Its fonts and stylesheet load only under `/admin`, so the API routes served by
 * this same process carry none of it. Cormorant Garamond for display type and
 * Jost for body — matching the storefront's design exactly.
 */
const display = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const sans = Jost({
  subsets: ["latin"],
  variable: "--font-jost",
  weight: ["300", "400", "500"],
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
