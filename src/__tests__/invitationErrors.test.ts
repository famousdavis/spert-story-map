// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import { parseBulkEmails, mapInvitationError } from '../lib/invitationErrors';

describe('parseBulkEmails', () => {
  it('parses comma-separated emails', () => {
    expect(parseBulkEmails('a@b.com, c@d.com')).toEqual({
      valid: ['a@b.com', 'c@d.com'],
      invalid: [],
    });
  });

  it('parses whitespace-separated emails', () => {
    expect(parseBulkEmails('a@b.com c@d.com')).toEqual({
      valid: ['a@b.com', 'c@d.com'],
      invalid: [],
    });
  });

  it('parses semicolon-separated emails', () => {
    expect(parseBulkEmails('a@b.com;c@d.com')).toEqual({
      valid: ['a@b.com', 'c@d.com'],
      invalid: [],
    });
  });

  it('parses newline-separated emails', () => {
    expect(parseBulkEmails('a@b.com\nc@d.com')).toEqual({
      valid: ['a@b.com', 'c@d.com'],
      invalid: [],
    });
  });

  it('parses mixed separators', () => {
    expect(parseBulkEmails('a@b.com, c@d.com;e@f.com\ng@h.com')).toEqual({
      valid: ['a@b.com', 'c@d.com', 'e@f.com', 'g@h.com'],
      invalid: [],
    });
  });

  it('deduplicates valid emails', () => {
    expect(parseBulkEmails('a@b.com, a@b.com, c@d.com')).toEqual({
      valid: ['a@b.com', 'c@d.com'],
      invalid: [],
    });
  });

  it('lowercases valid emails', () => {
    expect(parseBulkEmails('Alice@Example.COM')).toEqual({
      valid: ['alice@example.com'],
      invalid: [],
    });
  });

  it('deduplicates after lowercasing', () => {
    expect(parseBulkEmails('Alice@example.com, ALICE@example.com')).toEqual({
      valid: ['alice@example.com'],
      invalid: [],
    });
  });

  it('separates invalid (no @) from valid', () => {
    expect(parseBulkEmails('alice, bob@b.com')).toEqual({
      valid: ['bob@b.com'],
      invalid: ['alice'],
    });
  });

  it('separates invalid (missing TLD) from valid', () => {
    expect(parseBulkEmails('alice@b, bob@b.com')).toEqual({
      valid: ['bob@b.com'],
      invalid: ['alice@b'],
    });
  });

  it('captures the gmailcom case (missing dot)', () => {
    // Reproduces the v0.27.0 bug: yourmama@gmailcom was silently dropped.
    expect(parseBulkEmails(
      'a@b.com, c@d.com, yourmama@gmailcom',
    )).toEqual({
      valid: ['a@b.com', 'c@d.com'],
      invalid: ['yourmama@gmailcom'],
    });
  });

  it('lowercases invalid tokens too', () => {
    expect(parseBulkEmails('FOO@BAR')).toEqual({
      valid: [],
      invalid: ['foo@bar'],
    });
  });

  it('deduplicates invalid tokens', () => {
    expect(parseBulkEmails('garbage, garbage, also-garbage')).toEqual({
      valid: [],
      invalid: ['garbage', 'also-garbage'],
    });
  });

  it('returns empty lists for empty input', () => {
    expect(parseBulkEmails('')).toEqual({valid: [], invalid: []});
  });

  it('returns empty lists for whitespace-only input', () => {
    expect(parseBulkEmails('   \n  ')).toEqual({valid: [], invalid: []});
  });

  it('returns only invalid for invalid-only input', () => {
    expect(parseBulkEmails('garbage, also garbage')).toEqual({
      valid: [],
      invalid: ['garbage', 'also', 'garbage'].filter(
        (v, i, a) => a.indexOf(v) === i,
      ),
    });
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
