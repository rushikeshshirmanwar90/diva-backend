"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminApiError } from "@/app/admin/_lib/api";

/**
 * Fetch-on-mount with loading and error state.
 *
 * Every state update happens **after** an `await`. That is what keeps this
 * clear of React 19's `set-state-in-effect` rule: writing `setLoading(true)` at
 * the top of a fetch function looks asynchronous but is not — an async function
 * body runs synchronously up to its first `await`, so that call lands in the
 * effect's own render pass and triggers a cascading render.
 *
 * The other consequence of that ordering is nicer than it sounds:
 * stale-while-revalidate. When the dependencies change, the previous data stays
 * on screen until the new response lands, instead of the table blanking to a
 * spinner on every filter change.
 *
 * A response that arrives after the dependencies changed again is discarded via
 * the `cancelled` flag — otherwise a slow first request can land after a fast
 * second one and overwrite fresher data with staler.
 */

export type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
};

export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  options: { errorMessage?: string } = {},
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /**
   * Holds the current fetch closure so `reload` can stay referentially stable
   * with an empty dependency list — the caller supplies `deps`, which is a
   * variable, and hook dependency arrays must be literals.
   */
  const runRef = useRef<() => Promise<void>>(async () => {});

  const fallbackMessage = options.errorMessage ?? "Something went wrong.";

  // Serialised because `deps` is a fresh array on every render; comparing it by
  // identity would re-run the effect forever.
  const key = JSON.stringify(deps);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const result = await fetcher();
        if (cancelled) return;
        setData(result);
        setError("");
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof AdminApiError ? caught.message : fallbackMessage);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    runRef.current = run;
    void run();

    return () => {
      cancelled = true;
    };
    // `fetcher` and `fallbackMessage` are intentionally excluded: the caller
    // rebuilds the closure every render, and `key` already captures everything
    // that should trigger a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(() => runRef.current(), []);

  return { data, loading, error, reload };
}
