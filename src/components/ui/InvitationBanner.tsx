// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useInvitationLanding } from '../../hooks/useInvitationLanding';
import { useAuth } from '../../lib/AuthProvider';
import { useStorage } from '../../lib/StorageProvider';
import { useSignInWithTosGate } from '../../hooks/useSignInWithTosGate';
import TosConsentModal from '../settings/TosConsentModal';
import { GoogleIcon, MicrosoftIcon } from '../auth/AuthProviderLogos';

/**
 * Invitation landing banner — mounted once in App.tsx, outside <Routes>.
 * Renders on every route; returns null in the idle state.
 */
export default function InvitationBanner() {
  const { state, claimedNames, dismiss } = useInvitationLanding();
  const { user, firebaseAvailable } = useAuth();
  const { mode } = useStorage();
  const tos = useSignInWithTosGate();

  if (state === 'idle') return null;

  if (!firebaseAvailable) {
    return (
      <BannerShell color="amber" onDismiss={dismiss}>
        <p className="text-xs text-amber-800 dark:text-amber-200">
          Cloud sign-in is unavailable in this build.
        </p>
      </BannerShell>
    );
  }

  if (state === 'pre_auth' && !user) {
    return (
      <BannerShell color="blue" onDismiss={dismiss}>
        <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
          You've been invited to a SPERT Story Map project.
        </p>
        <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
          Sign in to accept the invitation.
        </p>
        {/* max-w-md prevents expansion in wide containers (Lesson 34) */}
        <div className="max-w-md flex gap-3">
          <button
            onClick={() => tos.signIn('google')}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            <GoogleIcon /> Sign in with Google
          </button>
          <button
            onClick={() => tos.signIn('microsoft')}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            <MicrosoftIcon /> Sign in with Microsoft
          </button>
        </div>
        {tos.authError && (
          <p className="text-xs text-red-500 dark:text-red-400 mt-2">{tos.authError}</p>
        )}
        {/* TosConsentModal: fixed inset-0 z-50 — layout-safe to nest here */}
        {tos.showTosConsent && (
          <TosConsentModal
            open
            onClose={tos.onTosCancel}
            onAccept={tos.onTosAccepted}
          />
        )}
      </BannerShell>
    );
  }

  if (state === 'claimed') {
    return (
      <BannerShell color="green" onDismiss={dismiss}>
        <p className="text-sm font-medium text-green-900 dark:text-green-100">
          You now have access to: {claimedNames.join(', ')}
        </p>
        {mode === 'local' && (
          <p className="text-xs text-green-700 dark:text-green-300 mt-1">
            Switch to Cloud Storage in Settings to view this project.
          </p>
        )}
      </BannerShell>
    );
  }

  // pre_auth + user = wrong-email, expired invite, or slow CF — 30s timer auto-dismisses
  if (state === 'pre_auth' && user) {
    return (
      <BannerShell color="amber" onDismiss={dismiss}>
        <p className="text-xs text-amber-800 dark:text-amber-200">
          We couldn't match this invitation to your account. If this seems wrong,
          ask the project owner to resend the invitation.
        </p>
      </BannerShell>
    );
  }

  return null;
}

// ── Internal layout helper ────────────────────────────────────────────────────
type BannerColor = 'blue' | 'green' | 'amber';

const colorMap: Record<BannerColor, { wrapper: string; dismiss: string }> = {
  blue: {
    wrapper: 'bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-700/50',
    dismiss: 'text-blue-500 dark:text-blue-400',
  },
  green: {
    wrapper: 'bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-700/50',
    dismiss: 'text-green-600 dark:text-green-400',
  },
  amber: {
    wrapper: 'bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700/50',
    dismiss: 'text-amber-600 dark:text-amber-400',
  },
};

function BannerShell({
  color,
  onDismiss,
  children,
}: {
  color: BannerColor;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  const c = colorMap[color];
  return (
    // role="status" + aria-live="polite": announces state transitions to screen readers
    <div className={`${c.wrapper} px-4 py-3`} role="status" aria-live="polite">
      <div className="max-w-lg mx-auto flex items-start justify-between gap-3">
        <div className="flex-1">{children}</div>
        <button
          onClick={onDismiss}
          className={`text-xs ${c.dismiss} flex-shrink-0 mt-0.5`}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
