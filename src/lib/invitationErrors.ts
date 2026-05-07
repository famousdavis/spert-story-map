// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// Client-side UX aid. Cloud Function validates authoritatively.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Map Firebase callable error codes to user-facing messages.
 * The context discriminator handles codes that mean different things
 * from different callables (Lesson 13).
 */
export function mapInvitationError(
  err: unknown,
  context: 'send' | 'resend' | 'revoke' = 'send',
): string {
  const code =
    err && typeof err === 'object' && 'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
      ? (err as { code: string }).code
      : 'unknown';
  if (code === 'functions/unauthenticated')
    return 'You must be signed in to perform this action. Please sign in and try again.';
  if (code === 'functions/not-found')
    return 'Project not found or you are not the owner.';
  if (code === 'functions/permission-denied')
    return 'Only the project owner can send invitations.';
  if (code === 'functions/invalid-argument')
    return 'One or more email addresses are invalid.';
  if (code === 'functions/resource-exhausted') {
    if (context === 'resend')
      return 'This invitation has already been resent the maximum number of times (5).';
    return 'You have reached your daily invitation limit (25). Try again tomorrow.';
  }
  if (code === 'functions/already-exists')
    return 'One or more invitees are already members or have a pending invitation.';
  if (code === 'functions/unavailable')
    return 'Invitation service is temporarily unavailable. Please try again.';
  if (context === 'revoke' && code === 'functions/failed-precondition')
    return 'This invitation has already been accepted or revoked.';
  return 'An unexpected error occurred. Please try again.';
}

/**
 * Parse a raw textarea value into a deduplicated, lowercased list of valid emails.
 * Accepts whitespace, comma, or semicolon as separators.
 */
export function parseBulkEmails(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map(e => e.trim().toLowerCase())
        .filter(e => EMAIL_RE.test(e)),
    ),
  ];
}
