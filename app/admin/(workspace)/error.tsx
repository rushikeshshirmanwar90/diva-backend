"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * The workspace's error boundary.
 *
 * Without one, anything thrown while rendering an admin page produces Next's
 * default 500 — a blank screen whose only detail is a digest hash. The most
 * common cause by far is the database being unreachable, and that is worth
 * naming on screen: it is a configuration problem the person looking at it can
 * usually fix in a minute, and it is not the same as "the console is broken".
 *
 * `reset()` re-renders the segment rather than reloading the page, so a
 * connection that has come back recovers without losing the rest of the app.
 */
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin] render failed", error);
  }, [error]);

  // Server errors reach the client with their message stripped in production,
  // so the digest is all there is to correlate against the server log.
  const message = error.message || "Something went wrong loading this screen.";

  return (
    <div className="panel" style={{ padding: 32, maxWidth: 640, margin: "48px auto" }}>
      <div className="alert-icon" style={{ marginBottom: 16 }}>
        <AlertTriangle />
      </div>

      <h1 style={{ fontSize: 20, margin: 0 }}>This screen could not load</h1>

      <p style={{ marginTop: 12, color: "var(--muted-foreground)", fontSize: 13 }}>{message}</p>

      {error.digest && (
        <p style={{ marginTop: 8, color: "var(--muted-foreground)", fontSize: 11 }}>
          Reference: {error.digest}
        </p>
      )}

      <button className="primary-button" onClick={reset} style={{ marginTop: 24 }}>
        <RotateCw />
        Try again
      </button>
    </div>
  );
}
