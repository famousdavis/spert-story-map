// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// O26 (v0.55.13): the write recorder the aiSessionStart* tests share. The B15
// fake (aiSessionFake.ts) records no snapshot delete and merges every update into
// the stored doc, so this wraps its six Firestore functions in one ordered log of
// each call's path and payload (or query). A test file installs it with
//   vi.mock('firebase/firestore', async () => (await import('./fixtures/aiSessionStartRecorder')).recordingFirestoreMock);
// It imports nothing that imports firebase/firestore, so that factory can load it
// (the harness, which imports the hook, cannot hold it for that reason).
import { firestoreMock as m } from './aiSessionFake';

export type Call = { kind: string; segs: string[]; data?: Record<string, unknown> };
export const calls = { log: [] as Call[] };

/** A doc or collection's path; a query's collection path plus each `where` as `<op><value>`. */
const segsOf = (target: unknown): string[] => {
  const t = target as {
    kind: string; segs?: string[]; col?: { segs: string[] };
    constraints?: Array<{ kind: string; op?: string; value?: unknown }>;
  };
  if (t.kind !== 'query') return t.segs ?? [];
  const wheres = (t.constraints ?? []).filter(c => c.kind === 'where').map(c => `${c.op}${String(c.value)}`);
  return [...(t.col?.segs ?? []), ...wheres];
};
const log = (kind: string, target: unknown, data?: Record<string, unknown>) => {
  calls.log.push({ kind, segs: segsOf(target), ...(data ? { data } : {}) });
};
type Ref = Parameters<typeof m.setDoc>[0];
type Q = Parameters<typeof m.getDocs>[0];
type Target = Parameters<typeof m.onSnapshot>[0];

export const recordingFirestoreMock = {
  ...m,
  setDoc: async (ref: Ref, data: Record<string, unknown>) => { log('setDoc', ref, data); return m.setDoc(ref, data); },
  updateDoc: async (ref: Ref, data: Record<string, unknown>) => { log('updateDoc', ref, data); return m.updateDoc(ref, data); },
  deleteDoc: async (ref: Ref) => { log('deleteDoc', ref); return m.deleteDoc(); },
  getDoc: async (ref: Ref) => { log('getDoc', ref); return m.getDoc(ref); },
  getDocs: async (q: Q) => { log('getDocs', q); return m.getDocs(q); },
  onSnapshot: (target: Target, onNext: (s: unknown) => void) => { log('onSnapshot', target); return m.onSnapshot(target, onNext); },
};
