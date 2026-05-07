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

export interface ParsedBulkEmails {
  valid: string[];
  invalid: string[];
}

/**
 * Parse a raw textarea value into deduplicated, lowercased lists of valid
 * and invalid email tokens. Accepts whitespace, comma, or semicolon as
 * separators. Empty tokens (from consecutive separators or trailing
 * whitespace) are dropped silently.
 *
 * Invalid emails are returned alongside valid ones so the caller can surface
 * them as "Skipped (invalid-format)" feedback in the UI. Without this, a
 * malformed address would be filtered before the Cloud Function call and the
 * user would see no signal that anything was dropped.
 */
export function parseBulkEmails(raw: string): ParsedBulkEmails {
  const tokens = [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map(e => e.trim().toLowerCase())
        .filter(e => e.length > 0),
    ),
  ];
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const t of tokens) {
    if (EMAIL_RE.test(t)) valid.push(t);
    else invalid.push(t);
  }
  return {valid, invalid};
}
