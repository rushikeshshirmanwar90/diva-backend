"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Gem, Info, Loader2, LogIn } from "lucide-react";
import { api, AdminApiError } from "@/app/admin/_lib/api";

/**
 * Admin sign-in.
 *
 * Not in the original design, which assumed an already-authenticated session —
 * so this is built from the same tokens and components as the rest of the
 * console.
 *
 * The silent-refresh attempt on mount is the last line of a two-part scheme: the
 * API client refreshes and replays in place, so a lapsed access token never
 * reaches this page. What lands here is a cold visit with a session cookie still
 * valid — a new tab, a bookmark, a restarted browser. If the refresh succeeds we
 * bounce straight through and the form never appears.
 *
 * Access tokens live 15 minutes; the session lives 48 hours (see
 * `REFRESH_TOKEN_TTL_DAYS`), which is the interval a password is actually
 * needed at.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  /**
   * Products, not the Overview at `/admin`.
   *
   * Overview is currently hidden from the sidebar, so landing there after every
   * sign-in would drop an admin on a page with no link back to it. `next` still
   * wins when it is present — an expired session resumes where it left off,
   * including on a hidden route.
   */
  const next = params.get("next") ?? "/admin/products";

  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await api.post("/auth/refresh", { audience: "admin" });
        if (cancelled) return;

        router.replace(next);
        router.refresh();
        return;
      } catch {
        // No usable refresh token — show the form. Expected on a first visit
        // and after signing out, so this failure is deliberately silent.
      }

      if (!cancelled) setChecking(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [next, router]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      // No email: the server resolves the admin account from ADMIN_LOGIN_EMAIL.
      await api.post("/auth/login", { password, audience: "admin" });
      router.replace(next);
      router.refresh();
    } catch (caught) {
      // The API's 401 says "Incorrect email or password" — deliberately vague so
      // it cannot be used to discover which accounts exist. There is no email
      // field here to be wrong, so name the only thing that can be.
      const message =
        caught instanceof AdminApiError
          ? caught.status === 401
            ? "Incorrect password."
            : caught.message
          : "We could not sign you in. Please try again.";

      setError(message);
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="login-page">
        <div className="login-checking">
          <Loader2 className="spin" />
          <span>Checking your session…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-symbol">
            <Gem />
          </div>
          <div>
            <div className="brand-name">DIVA</div>
            <div className="login-brand-sub">Admin workspace</div>
          </div>
        </div>

        <h1>Sign in</h1>
        <p className="login-intro">Enter the workspace password to continue.</p>

        {error && (
          <div className="form-alert" role="alert">
            <Info />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={submit} className="login-form">
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              autoFocus
            />
          </label>

          <button type="submit" className="primary-button login-submit" disabled={submitting}>
            {submitting ? <Loader2 className="spin" /> : <LogIn />}
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
