// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useCallback, useEffect, useState } from 'react';
import {
  getPendingAiTeardownSessionId,
  retryPendingAiTeardown,
  clearPendingAiTeardown,
  AI_TEARDOWN_CHANGED_EVENT,
} from '../../lib/aiSessionTeardown';

/**
 * B-04 — tell the user, in plain words, when sign-out could NOT end their
 * Connect AI session on the server (e.g. they were offline). Mounted once in
 * App.tsx, outside <Routes>, so it shows on whichever page the user lands on
 * after signing out. Returns null when there is nothing pending.
 *
 * It retries the teardown on mount and whenever the browser comes back online,
 * so in the common offline-then-online case it clears itself with no user
 * action. The message explains what the paired AI can still do and how to end
 * the session for sure.
 */
export default function AiTeardownBanner() {
  const [pending, setPending] = useState<boolean>(
    () => getPendingAiTeardownSessionId() !== null,
  );
  const [retrying, setRetrying] = useState(false);

  const refresh = useCallback(() => {
    setPending(getPendingAiTeardownSessionId() !== null);
  }, []);

  const retry = useCallback(async () => {
    if (!getPendingAiTeardownSessionId()) { refresh(); return; }
    setRetrying(true);
    try {
      await retryPendingAiTeardown();
    } finally {
      setRetrying(false);
      refresh();
    }
  }, [refresh]);

  useEffect(() => {
    // Re-read when the marker is set/cleared in THIS tab (custom event) or in
    // another tab (storage event), and retry automatically when back online.
    let active = true;
    const onChanged = () => refresh();
    const onOnline = () => { void retry(); };
    window.addEventListener(AI_TEARDOWN_CHANGED_EVENT, onChanged);
    window.addEventListener('storage', onChanged);
    window.addEventListener('online', onOnline);
    // Best-effort retry on load (covers "end the teardown on the next load").
    // Driven off the synchronous effect path: the only setState (refresh) runs
    // AFTER the await, so it never fires synchronously inside the effect.
    void (async () => {
      await retryPendingAiTeardown();
      if (active) refresh();
    })();
    return () => {
      active = false;
      window.removeEventListener(AI_TEARDOWN_CHANGED_EVENT, onChanged);
      window.removeEventListener('storage', onChanged);
      window.removeEventListener('online', onOnline);
    };
  }, [refresh, retry]);

  if (!pending) return null;

  return (
    <div
      className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700/50 px-4 py-3"
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-2xl mx-auto flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-1">
            Your AI assistant may still be connected.
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Signing out could not reach the server to end your Connect AI
            session. Until it does, a paired AI assistant can still read and
            change your last-open project. We will keep trying; you can also
            retry now. The session ends on its own within 7 days, or at once if
            you reconnect with Connect AI and then choose Disconnect.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <button
            onClick={() => void retry()}
            disabled={retrying}
            className="text-xs font-medium px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white transition-colors"
          >
            {retrying ? 'Trying…' : 'Try again'}
          </button>
          <button
            onClick={() => { clearPendingAiTeardown(); refresh(); }}
            className="text-xs text-amber-600 dark:text-amber-400"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
