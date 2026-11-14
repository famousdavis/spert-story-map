// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * B15 R-3: a tab with a live Connect AI session holds a SHARED Web Lock named
 * for that session, from going live until its local teardown. Another tab asks
 * `navigator.locks.query()` whether anyone holds it. No clock: a closed tab
 * releases its locks.
 */
export const sessionLockName = (sessionId: string) => `spert-ai:${sessionId}`;

function lockManager(): LockManager | null {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  return nav && nav.locks && typeof nav.locks.request === 'function' ? nav.locks : null;
}

/** Hold the session's lock until the returned function is called. */
export function holdSessionLock(sessionId: string): () => void {
  const locks = lockManager();
  if (!locks) return () => {};
  const abort = new AbortController();
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  locks.request(sessionLockName(sessionId), { mode: 'shared', signal: abort.signal }, () => held)
    .catch(() => { /* released before it was granted */ });
  return () => { abort.abort(); release(); };
}

/**
 * Names held or pending (a grant is asynchronous) in any tab of this browser,
 * or null where Web Locks are missing or the query fails (the caller falls back).
 */
export async function queryLockedNames(): Promise<Set<string> | null> {
  const locks = lockManager();
  if (!locks || typeof locks.query !== 'function') return null;
  try {
    const snap = await locks.query();
    const names = new Set<string>();
    for (const l of [...(snap.held ?? []), ...(snap.pending ?? [])]) if (l.name) names.add(l.name);
    return names;
  } catch { return null; }
}
