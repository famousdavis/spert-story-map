// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState } from 'react';
import { useAuth } from '../../lib/AuthProvider';
import { useStorage } from '../../lib/StorageProvider';
import Modal from './Modal';

function CloudIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
        fill="#0070f3"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="11" width="18" height="11" rx="2" stroke="#9CA3AF" strokeWidth="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface StorageStatusPillProps {
  onClick: () => void;
}

export default function StorageStatusPill({ onClick }: StorageStatusPillProps) {
  const { user, signOut } = useAuth();
  const { mode, switchMode } = useStorage();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const isCloudSignedIn = mode === 'cloud' && !!user;
  const displayName = user?.displayName ?? '';
  // Handle "Last, First" (Microsoft) and "First Last" (Google) formats
  const firstName = displayName.includes(',')
    ? (displayName.split(',')[1]?.trim().split(' ')[0] || user?.email || '')
    : (displayName.split(' ')[0] || user?.email || '');
  const initial = firstName.charAt(0).toUpperCase();

  const handlePillClick = () => {
    if (isCloudSignedIn) {
      setLogoutOpen(true);
    } else {
      onClick();
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      await switchMode('local');
      setLogoutOpen(false);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handlePillClick}
        className="flex items-center rounded-full cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
        style={{ border: '0.5px solid #D1D5DB' }}
        aria-label={
          isCloudSignedIn
            ? `Signed in as ${firstName} — click to sign out`
            : 'Sign in'
        }
      >
        {isCloudSignedIn ? (
          <>
            {/* Left segment: avatar + first name */}
            <div className="flex items-center gap-1.5 py-1 pl-1 pr-2.5">
              <div
                className="flex items-center justify-center rounded-full text-white shrink-0"
                style={{
                  width: 26,
                  height: 26,
                  backgroundColor: '#0070f3',
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                {initial}
              </div>
              <span style={{ fontSize: 13, fontWeight: 500 }} className="text-gray-900 dark:text-gray-100">
                {firstName}
              </span>
            </div>
            {/* Vertical divider */}
            <div className="self-stretch" style={{ width: '0.5px', backgroundColor: '#D1D5DB' }} />
            {/* Right segment: cloud icon (visual only) */}
            <div className="flex items-center justify-center px-2.5 py-1">
              <CloudIcon />
            </div>
          </>
        ) : (
          <>
            {/* Left segment: lock icon + "Local only" */}
            <div className="flex items-center gap-1.5 py-1 pl-2.5 pr-2.5">
              <LockIcon />
              <span style={{ fontSize: 13 }} className="text-gray-400">
                Local only
              </span>
            </div>
            {/* Vertical divider */}
            <div className="self-stretch" style={{ width: '0.5px', backgroundColor: '#D1D5DB' }} />
            {/* Right segment: "Sign in" label (visual only) */}
            <div className="flex items-center justify-center px-2.5 py-1">
              <span style={{ fontSize: 12, fontWeight: 500, color: '#0070f3' }}>
                Sign in
              </span>
            </div>
          </>
        )}
      </button>

      <Modal
        open={logoutOpen}
        onClose={() => { if (!signingOut) setLogoutOpen(false); }}
        title="Account"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center rounded-full text-white shrink-0"
              style={{
                width: 40,
                height: 40,
                backgroundColor: '#0070f3',
                fontSize: 16,
                fontWeight: 500,
              }}
            >
              {initial}
            </div>
            <div className="min-w-0">
              {user?.displayName && (
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {user.displayName}
                </div>
              )}
              {user?.email && (
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {user.email}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setLogoutOpen(false)}
              disabled={signingOut}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="px-4 py-2 text-sm font-medium text-white bg-[#0070f3] hover:bg-[#0060d3] rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {signingOut ? 'Signing out…' : 'Sign Out'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
