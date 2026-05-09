// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Centralized Cloud Function callable wrappers (Lesson 61).
 *
 * Replaces the per-call-site `if (!callable) throw` pattern with a single
 * `requireFunctions()` guard that produces a meaningful error when
 * functionsInstance is null (env vars missing, init failed, offline build).
 *
 * Each wrapper is async and returns the unwrapped `result.data`. A null
 * functionsInstance throws synchronously inside `requireFunctions()`, which
 * the async wrapper translates into a rejected promise — callers' existing
 * `.catch(...)` handlers see the canonical message instead of an opaque
 * "Cannot read properties of null (reading 'name')" SDK TypeError.
 *
 * Story Map has no voting model (only invitation send/claim/revoke/resend),
 * so there is no `callUpdateInvite` here.
 */

import { httpsCallable } from 'firebase/functions';
import { functionsInstance } from './firebase';
import type {
  SendInvitationEmailInput, SendInvitationEmailResult,
  ClaimPendingInvitationsResult,
  RevokeInviteInput, RevokeInviteResult,
  ResendInviteInput, ResendInviteResult,
} from '../types';

/**
 * Returns the initialized Firebase Functions instance, or throws a
 * human-readable error. All callable wrappers go through this guard.
 */
function requireFunctions() {
  if (!functionsInstance) throw new Error('Firebase Functions not initialized.');
  return functionsInstance;
}

/**
 * Sends bulk invitation emails for a project.
 *
 * Defense-in-depth note: TypeScript erases at runtime, so the
 * `'editor' | 'viewer'` literal on `SendInvitationEmailInput.role` does
 * NOT prevent a future code path or DOM-tampered call site from sending
 * `'owner'` or arbitrary strings. We runtime-validate `role` here. The
 * Cloud Function MUST also independently validate (this client check is
 * not a security boundary).
 *
 * Resend cap: server-side only (audit M3).
 *   The 5/5 resend cap is enforced exclusively by the `resendInvite` CF;
 *   the UI's `disabled={inv.emailSendCount >= 5}` on the Resend button is
 *   a UX gate, not a security gate. Direct client writes to
 *   `spertsuite_invitations` are denied by Firestore rules
 *   (`allow write: if false`), so a caller bypassing the UI cannot
 *   increment `emailSendCount` directly — they must go through the CF,
 *   which rejects with `functions/resource-exhausted` past the cap.
 *   `mapInvitationError` already surfaces this as a meaningful message.
 */
export async function callSendInvitationEmail(
  input: SendInvitationEmailInput,
): Promise<SendInvitationEmailResult> {
  if (input.role !== 'editor' && input.role !== 'viewer') {
    throw new Error(`Invalid invitation role: ${String(input.role)}`);
  }
  const r = await httpsCallable<SendInvitationEmailInput, SendInvitationEmailResult>(
    requireFunctions(), 'sendInvitationEmail',
  )(input);
  return r.data;
}

export async function callClaimPendingInvitations(): Promise<ClaimPendingInvitationsResult> {
  const r = await httpsCallable<Record<string, never>, ClaimPendingInvitationsResult>(
    requireFunctions(), 'claimPendingInvitations',
  )({});
  return r.data;
}

export async function callRevokeInvite(input: RevokeInviteInput): Promise<RevokeInviteResult> {
  const r = await httpsCallable<RevokeInviteInput, RevokeInviteResult>(
    requireFunctions(), 'revokeInvite',
  )(input);
  return r.data;
}

export async function callResendInvite(input: ResendInviteInput): Promise<ResendInviteResult> {
  const r = await httpsCallable<ResendInviteInput, ResendInviteResult>(
    requireFunctions(), 'resendInvite',
  )(input);
  return r.data;
}
