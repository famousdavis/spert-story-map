// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useAuth } from '../../lib/AuthProvider';
import { useStorage } from '../../lib/StorageProvider';
import { getFirstName } from '../../lib/userDisplay';

// The icons draw in `currentColor`, so they take the chip segment's colour: the state segment's muted text, or the act
// segment's link blue (FRAME26, v0.57.0). Before, the cloud was a fixed #0070f3 and the lock its own grey.
function CloudIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
        fill="currentColor"
      />
    </svg>
  );
}

// In the signed-in-local state this glyph is the only sign of the storage mode, so WCAG 1.4.11's 3:1 applies: it is the
// chip's muted text colour (4.84 / 6.82 : 1 on the page ground), in both segments.
function LockIcon() {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
      className="text-[color:var(--sf-text-muted)]"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** The signed-in person's initial: #0070f3 with a white letter (4.55 : 1), 22 px so it fits the 30 px chip. */
function Avatar({ initial }: { initial: string }) {
  return (
    <span
      className="flex items-center justify-center rounded-full text-white shrink-0"
      style={{ width: 22, height: 22, backgroundColor: '#0070f3', fontSize: 11, fontWeight: 500 }}
    >
      {initial}
    </span>
  );
}

interface StorageStatusPillProps {
  onClick: () => void;
}

/**
 * The frame's account chip (FRAME26, contract §3 and §7, v0.57.0): `.sf-chip`, 30 px tall, its right edge at the
 * column's right edge, last in the brand row. Two segments: the state (`.sf-chip-state`, muted) and the act
 * (`.sf-chip-act`, the link colour). The chip's ground on hover is the frame's `--sf-hover`. Every click, in every
 * state, opens the app's Settings dialog. Signed in, the accessible name ends "open Settings", the dialog's title
 * (v0.59.1; until then it said "click to open Cloud Storage settings", the dialog's name before v0.58.0). Signed out it
 * is "Sign in", the act segment's words. `accountChipOpensSettings.test.tsx` holds the name to the dialog it opens.
 */
export default function StorageStatusPill({ onClick }: StorageStatusPillProps) {
  const { user } = useAuth();
  const { mode } = useStorage();

  const isCloudSignedIn = mode === 'cloud' && !!user;
  const isSignedInLocal = !!user && mode === 'local';
  const firstName = getFirstName(user?.displayName, user?.email);
  const initial = firstName.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      onClick={onClick}
      className="sf-chip"
      data-sf="chip"
      aria-label={
        isCloudSignedIn
          ? `Signed in as ${firstName} — cloud storage — open Settings`
          : isSignedInLocal
            ? `Signed in as ${firstName} — local storage — open Settings`
            : 'Sign in'
      }
    >
      {isCloudSignedIn || isSignedInLocal ? (
        <>
          <span className="sf-chip-state">
            <Avatar initial={initial} />
            <span className="font-medium text-gray-900 dark:text-gray-100">{firstName}</span>
          </span>
          <span className="sf-chip-act">
            {isCloudSignedIn ? <CloudIcon /> : <LockIcon />}
          </span>
        </>
      ) : (
        <>
          <span className="sf-chip-state">
            <LockIcon />
            <span>Local only</span>
          </span>
          <span className="sf-chip-act">Sign in</span>
        </>
      )}
    </button>
  );
}
