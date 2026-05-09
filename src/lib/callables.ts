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

export async function callSendInvitationEmail(
  input: SendInvitationEmailInput,
): Promise<SendInvitationEmailResult> {
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
