// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Firebase stand-ins for the Terms sign-out tests (v0.55.16). The state lives in the test file
// (`vi.hoisted`), so it survives `vi.resetModules()`; this module holds no state of its own and is
// loaded by each file's `vi.mock` factories. Firebase calls an auth observer only when the user
// changes, so `signOut` delivers null only when someone is signed in.

type Listener = (user: unknown) => unknown;

export interface FirebaseStub {
  listeners: Set<Listener>;
  /** The user Firebase holds now; delivered to each new observer. */
  current: unknown;
  /** Every observer call, so a test can wait for the auth handler to finish. */
  runs: Promise<unknown>[];
  /** Errors thrown by an observer call. */
  errors: unknown[];
  /** `tosVersion` on `users/{uid}`; null means no record. */
  record: string | null;
  /** The Terms read rejects. */
  readFails: boolean;
  /** Holds the profile writes (offline at load) until released. */
  profileGate: Promise<void> | null;
  /** How many of the next `signOut` calls reject. */
  signOutRejects: number;
  /** Firebase calls in order: `signOut`, `setDoc <path>`, `read <path>`. */
  log: string[];
  /** The product documents the members query returns (Cloud storage), each with its `id` (v0.56.1). */
  cloud: Record<string, unknown>[];
}

export function resetStub(s: FirebaseStub): void {
  Object.assign(s, {
    listeners: new Set<Listener>(),
    current: null,
    runs: [],
    errors: [],
    record: null,
    readFails: false,
    profileGate: null,
    signOutRejects: 0,
    log: [],
    cloud: [],
  });
}

function call(s: FirebaseStub, cb: Listener, user: unknown): void {
  s.runs.push((async () => cb(user))().catch(e => { s.errors.push(e); }));
}

/** What a sign-in or a sign-out elsewhere does: Firebase tells every observer. */
export function emit(s: FirebaseStub, user: unknown): void {
  s.current = user;
  for (const cb of [...s.listeners]) call(s, cb, user);
}

export function authModule(s: FirebaseStub) {
  class GoogleAuthProvider {}
  class OAuthProvider { setCustomParameters() {} }
  return {
    GoogleAuthProvider,
    OAuthProvider,
    onAuthStateChanged: (_auth: unknown, cb: Listener) => {
      s.listeners.add(cb);
      setTimeout(() => call(s, cb, s.current), 0);
      return () => { s.listeners.delete(cb); };
    },
    signInWithPopup: async () => {},
    signOut: async () => {
      s.log.push('signOut');
      if (s.signOutRejects > 0) {
        s.signOutRejects -= 1;
        throw new Error('sign-out failed');
      }
      if (s.current !== null) emit(s, null);
    },
  };
}

export function firestoreModule(s: FirebaseStub) {
  return {
    doc: (_db: unknown, ...segs: string[]) => ({ path: segs.join('/') }),
    getDoc: async (ref: { path: string }) => {
      s.log.push(`read ${ref.path}`);
      if (ref.path.startsWith('users/')) {
        if (s.readFails) throw new Error('permission-denied');
        return { exists: () => s.record !== null, data: () => ({ tosVersion: s.record }) };
      }
      return { exists: () => false, data: () => undefined };
    },
    setDoc: async (ref: { path: string }) => {
      s.log.push(`setDoc ${ref.path}`);
      if (/profiles\//.test(ref.path) && s.profileGate) await s.profileGate;
    },
    serverTimestamp: () => ({ __ts: true }),
    // The members query, enough for Cloud storage's Products page (v0.56.1): every document in `cloud`.
    collection: (_db: unknown, ...segs: string[]) => ({ path: segs.join('/') }),
    query: (ref: { path: string }) => ref,
    where: () => null,
    getDocs: async () => {
      const docs = s.cloud.map(({ id, ...data }) => ({ id: String(id), data: () => ({ ...data }) }));
      return { docs, empty: docs.length === 0, size: docs.length, forEach: (cb: (d: unknown) => void) => docs.forEach(cb) };
    },
  };
}

export const firebaseModule = {
  auth: { fake: 'auth' },
  db: { fake: 'db' },
  functionsInstance: null,
  isFirebaseAvailable: true,
};

const refuse = () => Promise.reject(new Error('n/a'));
export const callablesModule = {
  callSendInvitationEmail: refuse,
  callClaimPendingInvitations: refuse,
  callRevokeInvite: refuse,
  callResendInvite: refuse,
  callGeneratePairingCode: refuse,
};
