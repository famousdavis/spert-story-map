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
 * Invitation landing banner — mounted once in the frame's notices slot (AppShell), first.
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
        <p>
          Cloud sign-in is unavailable in this build.
        </p>
      </BannerShell>
    );
  }

  if (state === 'pre_auth' && !user) {
    return (
      <BannerShell color="blue" onDismiss={dismiss}>
        <p className="font-medium">
          You've been invited to collaborate in SPERT Story Map.
        </p>
        <p className="mb-3">
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
        <p className="font-medium">
          You now have access to: {claimedNames.join(', ')}
        </p>
        {mode === 'local' && (
          <p>
            Switch to Cloud Storage in Settings to view {claimedNames.length > 1 ? 'them' : 'it'}.
          </p>
        )}
      </BannerShell>
    );
  }

  // pre_auth + user = wrong-email, expired invite, or slow CF — 30s timer auto-dismisses
  if (state === 'pre_auth' && user) {
    return (
      <BannerShell color="amber" onDismiss={dismiss}>
        <p>
          We couldn't match this invitation to your account. If this seems wrong,
          ask the person who invited you to resend the invitation.
        </p>
      </BannerShell>
    );
  }

  return null;
}

// ── Internal layout helper ────────────────────────────────────────────────────
// The frame's notice (FRAME26, v0.57.0), full width in its notices slot: the variant gives the ground, border and
// text colours, so no text colour is set inside it; links inherit and underline. "Dismiss" is `.sf-notice-dismiss`;
// the sign-in buttons keep their own look.
type BannerColor = 'blue' | 'green' | 'amber';

const variant: Record<BannerColor, string> = {
  blue: 'sf-notice--info',
  green: 'sf-notice--success',
  amber: 'sf-notice--caution',
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
  return (
    // role="status" + aria-live="polite": announces state transitions to screen readers
    <div className={`sf-notice ${variant[color]}`} role="status" aria-live="polite">
      <div className="flex-1">{children}</div>
      <button type="button" onClick={onDismiss} className="sf-notice-dismiss">
        Dismiss
      </button>
    </div>
  );
}
