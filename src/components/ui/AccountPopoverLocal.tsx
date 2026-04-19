// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { User } from 'firebase/auth';

interface AccountPopoverLocalProps {
  user: User;
  onSignOut: () => Promise<void>;
  onSwitchToCloud: () => void;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
}

export default function AccountPopoverLocal({
  user,
  onSignOut,
  onSwitchToCloud,
  onClose,
  anchorRef,
}: AccountPopoverLocalProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const signOutButtonRef = useRef<HTMLButtonElement | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // Focus the Sign Out button on mount.
  useEffect(() => {
    signOutButtonRef.current?.focus();
  }, []);

  // Dismiss on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !signingOut) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, signingOut]);

  // Dismiss on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (signingOut) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [anchorRef, onClose, signingOut]);

  const displayName = user.displayName ?? '';
  const firstName = displayName.includes(',')
    ? (displayName.split(',')[1]?.trim().split(' ')[0] || user.email || '')
    : (displayName.split(' ')[0] || user.email || '');
  const initial = firstName.charAt(0).toUpperCase();

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
      onClose();
    }
  };

  const handleSwitch = () => {
    onSwitchToCloud();
    onClose();
  };

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Account"
      className="absolute right-0 mt-2 w-72 rounded-lg bg-white dark:bg-gray-900 shadow-lg border border-gray-200 dark:border-gray-700 p-4 z-50"
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center justify-center rounded-full text-white shrink-0"
          style={{ width: 40, height: 40, backgroundColor: '#0070f3', fontSize: 16, fontWeight: 500 }}
        >
          {initial}
        </div>
        <div className="min-w-0">
          {user.displayName && (
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {user.displayName}
            </div>
          )}
          {user.email && (
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {user.email}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleSwitch}
          disabled={signingOut}
          className="w-full px-4 py-2 text-sm font-medium text-white bg-[#0070f3] hover:bg-[#0060d3] rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Switch to Cloud Storage
        </button>
        <button
          ref={signOutButtonRef}
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {signingOut ? 'Signing out…' : 'Sign Out'}
        </button>
      </div>
    </div>
  );
}
