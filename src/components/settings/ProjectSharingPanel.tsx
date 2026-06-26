// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useEffect, useId } from 'react';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { callSendInvitationEmail } from '../../lib/callables';
import { useAuth } from '../../lib/AuthProvider';
import { useStorage } from '../../lib/StorageProvider';
import { INVITATIONS_ENABLED } from '../../lib/featureFlags';
import { parseBulkEmails, mapInvitationError } from '../../lib/invitationErrors';
import { Section } from '../ui/Section';
import ConfirmDialog from '../ui/ConfirmDialog';
import type { PendingInvite, SendInvitationEmailResult, StorageDriver } from '../../types';
import { PROJECTS_COL, PROFILES_COL } from '../../lib/firestoreCollections';

/**
 * Project sharing UI — only renders in cloud mode for the project owner.
 * Reads/writes members directly from Firestore (not through the driver,
 * which strips ownership fields from products).
 *
 * Rendered by SharingSection (Settings page) with `withSectionWrapper`,
 * and by ShareDialog (homepage modal) without — so the modal body is
 * not double-headed.
 */
interface ProjectSharingPanelProps {
  productId: string;
  withSectionWrapper?: boolean;
}

/**
 * Four-state ownership/load status for the Sharing panel (Lesson 60).
 *
 *   loading    — initial fetch in flight; render nothing yet
 *   owner      — fetch succeeded, current user is the project owner
 *   not-owner  — fetch succeeded, current user is not the owner; render nothing
 *   error      — fetch threw or doc missing; render a visible "couldn't load" message
 *
 * Replaces the previous boolean `isOwner` derivation, which silently rendered
 * nothing on transient Firestore read failures. Non-cloud mode short-circuits
 * before the status branches are consulted.
 */
type OwnerStatus = 'loading' | 'owner' | 'not-owner' | 'error';

export default function ProjectSharingPanel({ productId, withSectionWrapper = false }: ProjectSharingPanelProps) {
  const { user } = useAuth();
  const { mode, driver } = useStorage();

  const [members, setMembers] = useState<Record<string, string> | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [ownerStatus, setOwnerStatus] = useState<OwnerStatus>('loading');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Load project members from Firestore.
  // ownerStatus advances loading → owner | not-owner | error based on outcome.
  useEffect(() => {
    if (mode !== 'cloud' || !user || !productId || !db) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional load-state reset on dep change
    setOwnerStatus('loading');

    async function load() {
      try {
        const snap = await getDoc(doc(db, PROJECTS_COL, productId));
        if (cancelled) return;
        if (!snap.exists()) {
          setOwnerStatus('error');
          return;
        }
        const data = snap.data();
        setOwner(data.owner);
        setMembers(data.members || {});
        setOwnerStatus(data.owner === user.uid ? 'owner' : 'not-owner');
      } catch (e) {
        if (cancelled) return;
        console.error('Failed to load project members:', e instanceof Error ? e.message : 'Unknown error');
        setOwnerStatus('error');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [mode, user, productId]);

  // Render gates (cascade — first match wins). Non-cloud short-circuits before
  // status branches; loading and not-owner render nothing; error surfaces a
  // visible message inside the optional Section wrapper.
  if (mode !== 'cloud' || !user) return null;
  if (ownerStatus === 'loading') return null;
  if (ownerStatus === 'not-owner') return null;
  if (ownerStatus === 'error') {
    const errorBody = (
      <p className="text-sm text-red-500 dark:text-red-400">
        Couldn&rsquo;t load sharing details. Refresh the page to try again.
      </p>
    );
    return withSectionWrapper ? <Section title="Sharing">{errorBody}</Section> : errorBody;
  }
  if (!members) return null; // ownerStatus === 'owner' but defensive null narrow

  const memberUids = Object.keys(members);

  const handleAddMember = async () => {
    if (!email.trim() || !db) return;
    setError(null);
    setAdding(true);

    try {
      // Look up user by email in profiles
      const q = query(collection(db, PROFILES_COL), where('email', '==', email.trim()), limit(1));
      const snap = await getDocs(q);

      if (snap.empty) {
        setError('Unable to add member. Please verify the email address and ensure they have signed in at least once.');
        setAdding(false);
        return;
      }

      const targetDoc = snap.docs[0];
      const targetUid = targetDoc.id;

      if (members[targetUid]) {
        setError('This user is already a member.');
        setAdding(false);
        return;
      }

      // Add member as editor
      const ref = doc(db, PROJECTS_COL, productId);
      const updated = { ...members, [targetUid]: 'editor' };
      await updateDoc(ref, { members: updated });
      setMembers(updated);
      setEmail('');
    } catch (e) {
      console.error('Failed to add member:', e instanceof Error ? e.message : 'Unknown error');
      setError('Failed to add member. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveMember = async (uid: string) => {
    if (uid === owner || !driver) return;
    setError(null);
    try {
      await driver.removeCollaborator(productId, uid);
      const updated = { ...members };
      delete updated[uid];
      setMembers(updated);
    } catch (e) {
      console.error('Failed to remove member:', e instanceof Error ? e.message : 'Unknown error');
      // Surface the driver's guard messages directly so the user sees
      // "Cannot remove yourself…" / "Cannot remove the project owner." etc.
      // (Lesson 50: removeCollaborator three-guard pattern.)
      setError(e instanceof Error ? e.message : 'Failed to remove member. Please try again.');
    }
  };

  const handleRoleChange = async (uid: string, newRole: string) => {
    if (uid === owner || !db) return;
    setError(null);
    try {
      const ref = doc(db, PROJECTS_COL, productId);
      const updated = { ...members, [uid]: newRole };
      await updateDoc(ref, { members: updated });
      setMembers(updated);
    } catch (e) {
      console.error('Failed to change role:', e instanceof Error ? e.message : 'Unknown error');
      setError('Failed to change role. Please try again.');
    }
  };

  const content = (
    <>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Share this project with others. Members can view or edit based on their role.
      </p>

      {/* Members list */}
      <div className="space-y-2 mb-4">
        {memberUids.map(uid => (
          <MemberRow
            key={uid}
            uid={uid}
            role={members[uid]}
            isOwner={uid === owner}
            isSelf={uid === user.uid}
            onRemove={() => handleRemoveMember(uid)}
            onRoleChange={(role) => handleRoleChange(uid, role)}
          />
        ))}
      </div>

      {INVITATIONS_ENABLED ? (
        <InvitationSection
          productId={productId}
          driver={driver}
          ownerStatus={ownerStatus}
          members={members}
          onMembersUpdate={setMembers}
          onOwnerStatusError={() => setOwnerStatus('error')}
        />
      ) : (
        /* Legacy single-input UI — preserved byte-for-byte */
        <div className="flex gap-2">
          <input
            type="email"
            name="memberEmail"
            autoComplete="off"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(null); }}
            placeholder="Enter email address"
            className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-400 dark:focus:border-blue-500 outline-none"
            onKeyDown={e => { if (e.key === 'Enter') handleAddMember(); }}
          />
          <button
            onClick={handleAddMember}
            disabled={!email.trim() || adding}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors"
          >
            {adding ? 'Adding...' : 'Add'}
          </button>
        </div>
      )}
      {error && (
        <p className="text-xs text-red-500 dark:text-red-400 mt-2">{error}</p>
      )}
    </>
  );

  return withSectionWrapper ? <Section title="Sharing">{content}</Section> : content;
}

interface MemberRowProps {
  uid: string;
  role: string;
  isOwner: boolean;
  isSelf: boolean;
  onRemove: () => void;
  onRoleChange: (role: string) => void;
}

/** Displays a single member with role and actions. */
function MemberRow({ uid, role, isOwner, isSelf, onRemove, onRoleChange }: MemberRowProps) {
  const [profile, setProfile] = useState<{ displayName?: string; email?: string } | null>(null);

  useEffect(() => {
    if (!db) return;
    getDoc(doc(db, PROFILES_COL, uid)).then(snap => {
      if (snap.exists()) setProfile(snap.data());
    });
  }, [uid]);

  const displayName = profile?.displayName || profile?.email || uid;
  const email = profile?.email || '';

  return (
    <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {displayName}
          {isSelf && <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">(you)</span>}
        </p>
        {email && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{email}</p>}
      </div>
      <div className="flex items-center gap-2 ml-3 flex-shrink-0">
        {isOwner ? (
          <span className="text-xs text-gray-400 dark:text-gray-500">Owner</span>
        ) : (
          <>
            <select
              name="memberRole"
              value={role}
              onChange={e => onRoleChange(e.target.value)}
              className="text-xs border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded px-1.5 py-1"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              onClick={onRemove}
              className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            >
              Remove
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface InvitationSectionProps {
  productId: string;
  driver: StorageDriver | null;
  ownerStatus: OwnerStatus;
  members: Record<string, string>;
  onMembersUpdate: (members: Record<string, string>) => void;
  onOwnerStatusError: () => void;
}

/**
 * Bulk-invitation subsystem (flag-on path). Self-contained: owns its own
 * pending-invite list, send/revoke/resend handlers, and revoke confirm
 * dialog. Surfaces members refreshes upward via onMembersUpdate, and a
 * post-send members-refresh failure via onOwnerStatusError so the parent
 * can hide the panel — preserving the previous inline behavior.
 */
function InvitationSection({
  productId,
  driver,
  ownerStatus,
  onMembersUpdate,
  onOwnerStatusError,
}: InvitationSectionProps) {
  const baseId = useId();
  const [bulkEmails, setBulkEmails] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [sending, setSending] = useState(false);
  const [inviteResult, setInviteResult] = useState<SendInvitationEmailResult | null>(null);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Load pending invitations (owner only). The parent gates on
  // INVITATIONS_ENABLED, so no flag check needed here.
  useEffect(() => {
    if (ownerStatus !== 'owner' || !driver) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional load-state reset on dep change
    setLoadingPending(true);
    driver.listPendingInvites(productId)
      .then(setPendingInvites)
      .catch(() => setPendingInvites([]))
      .finally(() => setLoadingPending(false));
  }, [ownerStatus, driver, productId]);

  const handleSendInvitations = async () => {
    const { valid, invalid } = parseBulkEmails(bulkEmails);
    if (valid.length === 0 && invalid.length === 0) return;
    if (!driver || !db) return;
    setSending(true);
    setInviteResult(null);
    // Pre-built failure entries for malformed addresses. The CF never sees
    // these (we filter client-side), so we have to surface them ourselves.
    const invalidFailures = invalid.map(email => ({
      email,
      reason: 'invalid-format',
    }));
    try {
      // No valid emails — short-circuit and just show the format errors.
      if (valid.length === 0) {
        setInviteResult({ added: [], invited: [], failed: invalidFailures });
        return;
      }

      const data = await callSendInvitationEmail({
        appId: 'spertstorymap',  // string literal — NOT TOS_APP_ID (Lesson 15)
        modelId: productId,
        emails: valid,
        role,
        isVoting: false,
      });
      setInviteResult({
        ...data,
        failed: [...data.failed, ...invalidFailures],
      });
      // Re-fetch members + pending invites in parallel (Lesson 64).
      // Promise.allSettled so a rejection in one doesn't lose the other's
      // update. Members refresh is direct Firestore — driver strips
      // owner/members from the parsed product, so the UI reads them itself.
      const [membersResult, pendingResult] = await Promise.allSettled([
        getDoc(doc(db, PROJECTS_COL, productId)),
        driver.listPendingInvites(productId),
      ]);
      if (membersResult.status === 'fulfilled' && membersResult.value.exists()) {
        onMembersUpdate(membersResult.value.data().members || {});
      } else if (membersResult.status === 'rejected') {
        console.warn('[ProjectSharingPanel] members refresh failed:', membersResult.reason);
        onOwnerStatusError();
      }
      if (pendingResult.status === 'fulfilled') {
        setPendingInvites(pendingResult.value);
      } else {
        console.warn('[ProjectSharingPanel] pending invites refresh failed:', pendingResult.reason);
      }
      // Clear the textarea only when at least one address actually went
      // through (added or invited). If every valid address ended up in
      // result.failed[] (e.g. CF rate-limited, all already-invited), preserve
      // the textarea so the user can retry without re-typing. (Lesson 43.)
      const anyDelivered =
        (data.added?.length ?? 0) + (data.invited?.length ?? 0) > 0;
      if (anyDelivered) setBulkEmails('');
    } catch (e) {
      console.error('Send invitations failed:', e instanceof Error ? e.message : 'Unknown error');
      setInviteError(mapInvitationError(e, 'send'));
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (tokenId: string) => {
    if (!driver) return;
    setActionBusy(tokenId);
    try {
      await driver.revokeInvite(tokenId);
      setPendingInvites(prev => prev.filter(i => i.tokenId !== tokenId));
    } catch (e) {
      setInviteError(mapInvitationError(e, 'revoke'));
    } finally {
      setActionBusy(null);
      setRevokeTarget(null);
    }
  };

  const handleResend = async (tokenId: string) => {
    if (!driver) return;
    setActionBusy(tokenId);
    try {
      await driver.resendInvite(tokenId);
      const updated = await driver.listPendingInvites(productId);
      setPendingInvites(updated);
    } catch (e) {
      setInviteError(mapInvitationError(e, 'resend'));
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <label htmlFor={`${baseId}-role`} className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
            Invite as
          </label>
          <select
            id={`${baseId}-role`}
            name="inviteRole"
            value={role}
            onChange={e => setRole(e.target.value as 'editor' | 'viewer')}
            className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded px-2 py-1.5"
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${baseId}-emails`} className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Email addresses
          </label>
          <textarea
            id={`${baseId}-emails`}
            name="inviteEmails"
            value={bulkEmails}
            onChange={e => {
              setBulkEmails(e.target.value);
              if (inviteResult) setInviteResult(null);
            }}
            placeholder="Enter email addresses separated by commas, spaces, or newlines"
            rows={3}
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-400 dark:focus:border-blue-500 outline-none resize-none"
          />
        </div>
        <button
          onClick={handleSendInvitations}
          disabled={!bulkEmails.trim() || sending}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors"
        >
          {sending ? 'Sending...' : 'Send Invitations'}
        </button>
        {inviteResult && (
          <div className="text-xs space-y-1">
            {inviteResult.added.length > 0 && (
              <p className="text-green-600 dark:text-green-400">Added: {inviteResult.added.join(', ')}</p>
            )}
            {inviteResult.invited.length > 0 && (
              <p className="text-blue-600 dark:text-blue-400">Invited: {inviteResult.invited.join(', ')}</p>
            )}
            {inviteResult.failed.map(f => (
              <p key={f.email} className="text-red-500 dark:text-red-400">Skipped: {f.email} ({f.reason})</p>
            ))}
          </div>
        )}
        {!loadingPending && pendingInvites.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Pending invitations</p>
            <div className="space-y-2">
              {pendingInvites.map(inv => (
                <div key={inv.tokenId} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{inv.inviteeEmail}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{inv.role} · sent {inv.emailSendCount}/5</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    {/* UX gate only — the resend cap is enforced server-side
                        by the resendInvite CF. Firestore rules deny client
                        writes to spertsuite_invitations, so a caller
                        bypassing this UI cannot increment emailSendCount
                        directly. See callables.ts for the trust model. */}
                    <button
                      onClick={() => handleResend(inv.tokenId)}
                      disabled={inv.emailSendCount >= 5 || actionBusy !== null}
                      className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-40"
                    >
                      Resend ({inv.emailSendCount}/5)
                    </button>
                    <button
                      onClick={() => setRevokeTarget(inv.tokenId)}
                      disabled={actionBusy !== null}
                      className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-40"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {inviteError && (
        <p className="text-xs text-red-500 dark:text-red-400 mt-2">{inviteError}</p>
      )}
      <ConfirmDialog
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => revokeTarget && void handleRevoke(revokeTarget)}
        title="Revoke Invitation"
        message="Are you sure you want to revoke this invitation? The recipient will no longer be able to accept it."
        confirmLabel="Revoke"
        danger
      />
    </>
  );
}
