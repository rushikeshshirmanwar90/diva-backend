"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, createContext, useContext } from "react";
import {
  Boxes,
  ChevronRight,
  Gem,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Sparkles,
  Tags,
  Users,
  X,
} from "lucide-react";
import { api, type AdminUser } from "@/app/admin/_lib/api";
import { initials } from "@/app/admin/_lib/format";

/**
 * The persistent chrome: sidebar, header, toast host.
 *
 * The design kept every screen in one component with local state switching
 * views. This uses real routes instead — `/admin/products`, `/admin/customers` and
 * so on — because an admin console that cannot be deep-linked or bookmarked is
 * a constant small friction: you cannot send a colleague "look at this
 * product", and the browser back button does nothing.
 */

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

type ToastContextValue = { notify: (message: string) => void };

const ToastContext = createContext<ToastContextValue>({ notify: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * Only screens with a backend behind them appear here. Orders, shipping,
 * discounts and settings have models written but no API surface yet, so linking
 * to them would offer the admin a door that opens onto nothing.
 *
 * `hidden` entries stay in this list rather than being deleted. They are still
 * *routes* — reachable by URL, and still matched below so the topbar names the
 * page correctly if someone lands on one. Deleting them instead would leave
 * those pages titled after whatever happened to be first in the list. Showing
 * one again is a matter of removing its flag.
 */
type NavEntry = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  /** Kept out of the sidebar, still resolved for the topbar title. */
  hidden?: boolean;
};

const WORKSPACE_NAV: NavEntry[] = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard, hidden: true },
  { label: "Products", href: "/admin/products", icon: Gem },
  { label: "Categories", href: "/admin/categories", icon: Tags },
  { label: "Collections", href: "/admin/collections", icon: Layers, hidden: true },
  { label: "Inventory", href: "/admin/inventory", icon: Boxes, hidden: true },
  { label: "Customers", href: "/admin/customers", icon: Users, hidden: true },
];

export function AdminShell({
  user,
  children,
}: {
  user: AdminUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState("");

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }, []);

  const current =
    WORKSPACE_NAV
      .filter((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`))
      // Longest match wins, so /admin/products/new resolves to Products rather
      // than to the /admin overview.
      .sort((a, b) => b.href.length - a.href.length)[0] ?? WORKSPACE_NAV[0]!;

  const signOut = async () => {
    try {
      await api.post("/auth/logout?audience=admin");
    } finally {
      router.push("/admin/login");
      router.refresh();
    }
  };

  const renderNav = (entries: NavEntry[]) =>
    entries.map(({ label, href, icon: Icon }) => {
      const active = current.href === href;
      return (
        <Link
          key={href}
          href={href}
          className={`nav-item ${active ? "nav-item-active" : ""}`}
          aria-current={active ? "page" : undefined}
          // Closed here rather than in an effect on `pathname`: the click is
          // the actual event, and reacting to the route change instead means a
          // needless extra render on every navigation.
          onClick={() => setMobileNavOpen(false)}
        >
          <Icon />
          <span>{label}</span>
        </Link>
      );
    });

  return (
    <ToastContext.Provider value={{ notify }}>
      <div className="admin-shell">
        <aside className={`admin-sidebar ${mobileNavOpen ? "admin-sidebar-open" : ""}`}>
          <div className="brand-lockup">
            <div className="brand-symbol">
              <Gem />
            </div>
            <div>
              <div className="brand-name">DIVA</div>
              <div className="brand-subtitle">Admin workspace</div>
            </div>
            <button
              className="mobile-close"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation"
            >
              <X />
            </button>
          </div>

          <nav className="admin-nav" aria-label="Admin navigation">
            <div className="nav-label">Workspace</div>
            {renderNav(WORKSPACE_NAV.filter((entry) => !entry.hidden))}
          </nav>

          <div className="sidebar-bottom">
            <div className="user-row">
              <div className="user-avatar">{initials(user.name)}</div>
              <div className="user-copy">
                <strong>{user.name}</strong>
                <span>{titleCase(user.role)}</span>
              </div>
              <button className="icon-button" onClick={signOut} aria-label="Sign out">
                <LogOut />
              </button>
            </div>
          </div>
        </aside>

        {mobileNavOpen && (
          <button
            className="nav-scrim"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          />
        )}

        <main className="admin-main">
          <header className="admin-header">
            <div className="header-left">
              <button
                className="mobile-menu"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation"
              >
                <Menu />
              </button>
              <div className="breadcrumb">
                <span>Workspace</span>
                <ChevronRight />
                <strong>{current.label}</strong>
              </div>
            </div>
            <div className="header-actions">
              <GlobalSearch />
              <div className="header-avatar">{initials(user.name)}</div>
            </div>
          </header>
          <div className="content-wrap">{children}</div>
        </main>

        {toast && (
          <div className="toast-message" role="status">
            <Sparkles />
            {toast}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Header search. Submits into the product list rather than pretending to search
 * everything — products are the only searchable collection today, and a box
 * that silently ignores half of what you type is worse than a specific one.
 */
function GlobalSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("admin-global-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <form
      className="header-search"
      onSubmit={(event) => {
        event.preventDefault();
        router.push(`/admin/products?q=${encodeURIComponent(value)}`);
      }}
    >
      <Search />
      <input
        id="admin-global-search"
        aria-label="Search products"
        placeholder="Search products..."
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <kbd>⌘ K</kbd>
    </form>
  );
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
