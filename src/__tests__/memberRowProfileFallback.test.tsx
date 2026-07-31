// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
//
// Regression: the Share Project member list rendered a raw Firebase Auth UID
// ("nT5V5xk8pcNHpHE7IjMxJtmQBPa2") instead of a name or email.
//
// Cause: MemberRow resolved display names only against spertstorymap_profiles,
// which each app writes on ITS OWN sign-in. The cross-app invitation Cloud
// Function (sendInvitationEmail) resolves an invitee BY their
// spertsuite_profiles doc and then writes only `members.{uid}` on the project —
// it never seeds a per-app profile. So anyone added who had used another SPERT
// app but never signed into Story Map had no per-app profile, and the row fell
// all the way through to the uid.
//
// Fix: fall back to spertsuite_profiles/{uid} when the per-app doc is missing.
// Both collections are written with the same payload shape by AuthProvider, and
// firestore.rules already permits `get` on spertsuite_profiles for any authed
// user, so no rules change was needed.
//
// Observed in production 2026-07-28 (SPERT Story Map, "ChatGPT Italy Vacation").

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const OWNER_UID = 'owner-uid-0000000000000000';
const MEMBER_UID = 'nT5V5xk8pcNHpHE7IjMxJtmQBPa2';

/** Docs keyed by "collection/id". Absent key === snapshot.exists() false. */
let docs: Record<string, Record<string, unknown>> = {};
/** Every path passed to getDoc, so we can assert on read behaviour. */
let reads: string[] = [];

vi.mock('../lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
  getDoc: async (ref: { path: string }) => {
    reads.push(ref.path);
    const data = docs[ref.path];
    return { exists: () => data !== undefined, data: () => data };
  },
  updateDoc: vi.fn().mockResolvedValue(undefined),
  collection: (_db: unknown, col: string) => ({ col }),
  query: (...a: unknown[]) => a,
  where: (...a: unknown[]) => a,
  limit: (...a: unknown[]) => a,
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
}));

vi.mock('../lib/AuthProvider', () => ({
  useAuth: () => ({ user: { uid: OWNER_UID, email: 'davisw2@ufl.edu' } }),
}));

vi.mock('../lib/StorageProvider', () => ({
  useStorage: () => ({ mode: 'cloud', driver: { removeCollaborator: vi.fn() } }),
}));

vi.mock('../lib/callables', () => ({
  callSendInvitationEmail: vi.fn(),
}));

// Skip InvitationSection so this test exercises only the member list.
vi.mock('../lib/featureFlags', () => ({ INVITATIONS_ENABLED: false }));

import ProjectSharingPanel from '../components/settings/ProjectSharingPanel';

beforeEach(() => {
  reads = [];
  docs = {
    'spertstorymap_projects/p1': {
      owner: OWNER_UID,
      members: { [OWNER_UID]: 'owner', [MEMBER_UID]: 'editor' },
    },
    // The owner has signed into Story Map, so they have a per-app profile.
    [`spertstorymap_profiles/${OWNER_UID}`]: {
      displayName: 'William W Davis',
      email: 'davisw2@ufl.edu',
    },
  };
});

afterEach(() => { cleanup(); });

describe('MemberRow profile resolution', () => {
  it('falls back to spertsuite_profiles when the per-app profile is missing', async () => {
    // Added via the cross-app Cloud Function: suite mirror only.
    docs[`spertsuite_profiles/${MEMBER_UID}`] = {
      displayName: 'William W Davis',
      email: 'famousdavispmp@gmail.com',
    };

    render(<ProjectSharingPanel productId="p1" />);

    await waitFor(() => {
      expect(screen.getByText('famousdavispmp@gmail.com')).toBeInTheDocument();
    });
    // The bug: the raw UID must never be user-visible.
    expect(screen.queryByText(MEMBER_UID)).not.toBeInTheDocument();
  });

  it('shows the email when the suite mirror carries no displayName', async () => {
    docs[`spertsuite_profiles/${MEMBER_UID}`] = {
      email: 'famousdavispmp@gmail.com',
    };

    render(<ProjectSharingPanel productId="p1" />);

    // getAllByText, not getByText: with no displayName, MemberRow uses the
    // email for BOTH the headline and the sub-line, so it appears twice.
    // Pre-existing cosmetic behaviour, unrelated to the UID fallback — asserted
    // as-is here so this test documents it rather than silently depending on it.
    await waitFor(() => {
      expect(screen.getAllByText('famousdavispmp@gmail.com').length)
        .toBeGreaterThan(0);
    });
    expect(screen.queryByText(MEMBER_UID)).not.toBeInTheDocument();
  });

  it('does not read the suite mirror when the per-app profile exists', async () => {
    docs[`spertstorymap_profiles/${MEMBER_UID}`] = {
      displayName: 'Local Profile Name',
      email: 'local@example.com',
    };
    docs[`spertsuite_profiles/${MEMBER_UID}`] = {
      displayName: 'Suite Profile Name',
      email: 'suite@example.com',
    };

    render(<ProjectSharingPanel productId="p1" />);

    await waitFor(() => {
      expect(screen.getByText('Local Profile Name')).toBeInTheDocument();
    });
    expect(screen.queryByText('Suite Profile Name')).not.toBeInTheDocument();
    expect(reads).not.toContain(`spertsuite_profiles/${MEMBER_UID}`);
  });

  it('still falls back to the uid when neither profile exists', async () => {
    render(<ProjectSharingPanel productId="p1" />);

    // Both lookups must be awaited INSIDE waitFor. The uid is what MemberRow
    // renders before either profile resolves (`profile?.displayName ||
    // profile?.email || uid`), so waiting on the uid alone is satisfied by the
    // very first render and the reads below could race it — an intermittent
    // failure seen once in ~20 full-suite runs.
    await waitFor(() => {
      expect(reads).toContain(`spertstorymap_profiles/${MEMBER_UID}`);
      expect(reads).toContain(`spertsuite_profiles/${MEMBER_UID}`);
    });
    expect(screen.getByText(MEMBER_UID)).toBeInTheDocument();
  });
});
