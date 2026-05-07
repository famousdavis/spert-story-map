// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import { parseBulkEmails, mapInvitationError } from '../lib/invitationErrors';

describe('parseBulkEmails', () => {
  it('parses comma-separated emails', () => {
    expect(parseBulkEmails('a@b.com, c@d.com')).toEqual(['a@b.com', 'c@d.com']);
  });

  it('parses whitespace-separated emails', () => {
    expect(parseBulkEmails('a@b.com c@d.com')).toEqual(['a@b.com', 'c@d.com']);
  });

  it('parses semicolon-separated emails', () => {
    expect(parseBulkEmails('a@b.com;c@d.com')).toEqual(['a@b.com', 'c@d.com']);
  });

  it('parses newline-separated emails', () => {
    expect(parseBulkEmails('a@b.com\nc@d.com')).toEqual(['a@b.com', 'c@d.com']);
  });

  it('parses mixed separators', () => {
    expect(parseBulkEmails('a@b.com, c@d.com;e@f.com\ng@h.com')).toEqual([
      'a@b.com', 'c@d.com', 'e@f.com', 'g@h.com',
    ]);
  });

  it('deduplicates emails', () => {
    expect(parseBulkEmails('a@b.com, a@b.com, c@d.com')).toEqual(['a@b.com', 'c@d.com']);
  });

  it('lowercases emails', () => {
    expect(parseBulkEmails('Alice@Example.COM')).toEqual(['alice@example.com']);
  });

  it('deduplicates after lowercasing', () => {
    expect(parseBulkEmails('Alice@example.com, ALICE@example.com')).toEqual(['alice@example.com']);
  });

  it('filters bare words (no @)', () => {
    expect(parseBulkEmails('alice, bob@b.com')).toEqual(['bob@b.com']);
  });

  it('filters missing TLD', () => {
    expect(parseBulkEmails('alice@b, bob@b.com')).toEqual(['bob@b.com']);
  });

  it('returns empty array for empty input', () => {
    expect(parseBulkEmails('')).toEqual([]);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(parseBulkEmails('   \n  ')).toEqual([]);
  });

  it('returns empty array for invalid-only input', () => {
    expect(parseBulkEmails('garbage, also garbage')).toEqual([]);
  });
});

describe('mapInvitationError', () => {
  const err = (code: string) => ({ code });

  it('maps unauthenticated to actionable message', () => {
    expect(mapInvitationError(err('functions/unauthenticated'))).toMatch(/signed in/i);
  });

  it('maps not-found to ownership message', () => {
    expect(mapInvitationError(err('functions/not-found'))).toMatch(/not found|not the owner/i);
  });

  it('maps permission-denied to owner-only message', () => {
    expect(mapInvitationError(err('functions/permission-denied'))).toMatch(/owner/i);
  });

  it('maps invalid-argument to email-format message', () => {
    expect(mapInvitationError(err('functions/invalid-argument'))).toMatch(/invalid/i);
  });

  it('maps resource-exhausted in resend context to per-invitation cap', () => {
    expect(mapInvitationError(err('functions/resource-exhausted'), 'resend'))
      .toMatch(/maximum.*5/i);
  });

  it('maps resource-exhausted in send context to per-day cap', () => {
    expect(mapInvitationError(err('functions/resource-exhausted'), 'send'))
      .toMatch(/daily.*25/i);
  });

  it('maps resource-exhausted in revoke context falls back to send-style message', () => {
    // Revoke context isn't documented for resource-exhausted; falls through to default branch.
    expect(mapInvitationError(err('functions/resource-exhausted'), 'revoke'))
      .toMatch(/daily.*25/i);
  });

  it('maps already-exists to already-member message', () => {
    expect(mapInvitationError(err('functions/already-exists'))).toMatch(/already.*member|pending/i);
  });

  it('maps unavailable to retry message', () => {
    expect(mapInvitationError(err('functions/unavailable'))).toMatch(/temporarily/i);
  });

  it('maps failed-precondition in revoke context', () => {
    expect(mapInvitationError(err('functions/failed-precondition'), 'revoke'))
      .toMatch(/already.*accepted|revoked/i);
  });

  it('falls back to generic message for unknown code', () => {
    expect(mapInvitationError(err('functions/something-else')))
      .toMatch(/unexpected/i);
  });

  it('falls back to generic message for non-error input', () => {
    expect(mapInvitationError(null)).toMatch(/unexpected/i);
    expect(mapInvitationError({})).toMatch(/unexpected/i);
    expect(mapInvitationError('not an error')).toMatch(/unexpected/i);
  });
});
