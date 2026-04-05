// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useAuth } from '../../lib/AuthProvider';
import { useStorage } from '../../lib/StorageProvider';

function DatabaseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
      <path d="M10 2C6.686 2 4 3.343 4 5s2.686 3 6 3 6-1.343 6-3-2.686-3-6-3z" />
      <path d="M4 7v2c0 1.657 2.686 3 6 3s6-1.343 6-3V7c0 1.657-2.686 3-6 3S4 8.657 4 7z" />
      <path d="M4 11v2c0 1.657 2.686 3 6 3s6-1.343 6-3v-2c0 1.657-2.686 3-6 3s-6-1.343-6-3z" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
      <path d="M1 12.5A4.5 4.5 0 005.5 17H15a3 3 0 001.5-5.605 4.5 4.5 0 00-7.925-3.698A3.5 3.5 0 001 12.5z" />
    </svg>
  );
}

function getDisplayName(user: { displayName?: string | null; email?: string | null }): string {
  if (user.displayName) return user.displayName;
  if (user.email) return user.email.split('@')[0];
  return '?';
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '\u2026' : str;
}

interface StorageStatusPillProps {
  onClick: () => void;
}

export default function StorageStatusPill({ onClick }: StorageStatusPillProps) {
  const { user } = useAuth();
  const { mode } = useStorage();

  if (mode === 'local') {
    return (
      <button
        onClick={onClick}
        title="Using local storage — click to manage in Settings"
        className="flex items-center gap-1.5 rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
      >
        <DatabaseIcon />
        Local
      </button>
    );
  }

  // Cloud mode, signed in
  if (user) {
    const name = getDisplayName(user);
    const initial = name[0]?.toUpperCase() ?? '?';
    const label = truncate(name, 16);
    return (
      <button
        onClick={onClick}
        title={`Signed in as ${user.email ?? name} — click to manage in Settings`}
        className="flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
      >
        <span
          aria-hidden="true"
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white dark:bg-blue-500"
        >
          {initial}
        </span>
        <span className="max-w-[8rem] truncate">{label}</span>
        <CloudIcon />
      </button>
    );
  }

  // Cloud mode, signed out
  return (
    <button
      onClick={onClick}
      title="Cloud storage selected but not signed in — click to sign in"
      className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
    >
      <CloudIcon />
      Sign in
    </button>
  );
}
