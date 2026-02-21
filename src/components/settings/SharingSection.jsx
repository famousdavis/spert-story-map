import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthProvider';
import { useStorage } from '../../lib/StorageProvider';
import { Section } from '../ui/Section';

const PROJECTS_COL = 'spertstorymap_projects';
const PROFILES_COL = 'spertstorymap_profiles';

/**
 * Project sharing UI — only renders in cloud mode for the project owner.
 * Reads/writes members directly from Firestore (not through the driver,
 * which strips ownership fields from products).
 */
export default function SharingSection({ productId }) {
  const { user } = useAuth();
  const { mode } = useStorage();
  const [members, setMembers] = useState(null);
  const [owner, setOwner] = useState(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);

  const isOwner = user && owner === user.uid;

  // Load project members from Firestore
  useEffect(() => {
    if (mode !== 'cloud' || !user || !productId || !db) return;
    let cancelled = false;

    async function load() {
      try {
        const snap = await getDoc(doc(db, PROJECTS_COL, productId));
        if (!snap.exists() || cancelled) return;
        const data = snap.data();
        setOwner(data.owner);
        setMembers(data.members || {});
      } catch (e) {
        console.error('Failed to load project members:', e);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [mode, user, productId]);

  // Don't render if not cloud mode, not owner, or still loading
  if (mode !== 'cloud' || !user || !isOwner || !members) return null;

  const memberUids = Object.keys(members);

  const handleAddMember = async () => {
    if (!email.trim() || !db) return;
    setError(null);
    setAdding(true);

    try {
      // Look up user by email in profiles
      const q = query(collection(db, PROFILES_COL), where('email', '==', email.trim()));
      const snap = await getDocs(q);

      if (snap.empty) {
        setError('User not found. They need to sign in to SPERT Story Map at least once.');
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
      console.error('Failed to add member:', e);
      setError('Failed to add member. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveMember = async (uid) => {
    if (uid === owner || !db) return;
    try {
      const ref = doc(db, PROJECTS_COL, productId);
      const updated = { ...members };
      delete updated[uid];
      await updateDoc(ref, { members: updated });
      setMembers(updated);
    } catch (e) {
      console.error('Failed to remove member:', e);
    }
  };

  const handleRoleChange = async (uid, newRole) => {
    if (uid === owner || !db) return;
    try {
      const ref = doc(db, PROJECTS_COL, productId);
      const updated = { ...members, [uid]: newRole };
      await updateDoc(ref, { members: updated });
      setMembers(updated);
    } catch (e) {
      console.error('Failed to change role:', e);
    }
  };

  return (
    <Section title="Sharing">
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

      {/* Add member */}
      <div className="flex gap-2">
        <input
          type="email"
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
      {error && (
        <p className="text-xs text-red-500 dark:text-red-400 mt-2">{error}</p>
      )}
    </Section>
  );
}

/** Displays a single member with role and actions. */
function MemberRow({ uid, role, isOwner, isSelf, onRemove, onRoleChange }) {
  const [profile, setProfile] = useState(null);

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
