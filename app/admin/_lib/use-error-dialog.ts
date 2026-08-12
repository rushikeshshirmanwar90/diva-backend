"use client";

import { useCallback, useState } from "react";

/**
 * Drives `ErrorDialog` from the error string `useAsyncData` already returns.
 *
 * The whole problem this solves is "when should it be open again". A dialog
 * derived straight from `Boolean(error)` cannot be closed — dismissing it does
 * not clear the error, so it reopens on the next render and the Dismiss button
 * appears broken. Tracking a boolean instead has the opposite fault: dismiss
 * once and a genuinely *different* failure later stays silent.
 *
 * So dismissal records **which message** was dismissed. A new message reopens
 * the dialog; the same one does not. And retrying clears the record, because
 * asking for something again is a request to be told how it went — including
 * when it fails the same way twice.
 */
export type ErrorDialogState = {
  open: boolean;
  retrying: boolean;
  close: () => void;
  retry: () => Promise<void>;
};

export function useErrorDialog(error: string, reload: () => Promise<void>): ErrorDialogState {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const close = useCallback(() => setDismissed(error), [error]);

  const retry = useCallback(async () => {
    setDismissed(null);
    setRetrying(true);

    try {
      await reload();
    } finally {
      // `useAsyncData` swallows the rejection and reports through `error`, so
      // this runs on both paths. `finally` regardless: a spinner that never
      // stops is the one failure mode worse than the error it was reporting.
      setRetrying(false);
    }
  }, [reload]);

  return { open: Boolean(error) && error !== dismissed, retrying, close, retry };
}
