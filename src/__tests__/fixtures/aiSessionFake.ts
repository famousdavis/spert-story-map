// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// B15 harness: a fake of the Connect AI relay (session docs, ops, snapshots, the
// teardownAiSession callable) and of navigator.locks, enough for the real
// useAiConnectivity hook to run. Ported from the Char-B15-1 characterisation
// harness, with what the reviewers found it could not express: timestamps carry a
// real time (`toDate`), the AI's writes stamp `lastActiveAt` as landing's
// writeOpBatch does (session.ts:118-123), the callable is observable, and locks
// are shared by every simulated tab in one jsdom.

type Op = { seq: number; op: string; payload: unknown };
type Ref = { kind: 'doc' | 'col'; segs: string[] };
type Where = { kind: 'where'; field: string; op: string; value: number };
type Query = { kind: 'query'; col: Ref; constraints: Array<Where | { kind: 'orderBy' }> };
type Listener = {
  tab: string; kind: 'ops' | 'session'; sessionId: string; afterSeq: number;
  onNext: (s: unknown) => void; active: boolean;
};
type Session = Record<string, unknown>;

export const ts = (d: Date) => ({ toDate: () => d });
const ST = { __serverTimestamp: true };
const stamp = (v: unknown): unknown =>
  v === ST ? ts(new Date()) : v instanceof Date ? ts(v) : v;
const stampAll = (data: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, stamp(v)]));

export const server = {
  sessions: new Map<string, Session>(),
  ops: new Map<string, Op[]>(),
  snapshotWrites: [] as Array<{ sessionId: string; productId: string }>,
  openProductIdWrites: [] as Array<{ sessionId: string; value: unknown }>,
  teardownCalls: [] as string[],
  failTeardown: false,
  failCreate: false,
  /** When set, a session create waits for it (a slow network). */
  createGate: null as Promise<void> | null,
  /** When set, every session doc read (getDoc) waits for it. */
  readGate: null as Promise<void> | null,
  /** When set, every session doc update (updateDoc) waits for it. */
  updateGate: null as Promise<void> | null,
  /** When set, updateDoc throws with this code (e.g. the doc went between a read and the write). */
  failUpdate: null as string | null,
  failRead: new Set<string>(),
  listeners: [] as Listener[],
  currentTab: 'tab1',
  reset() {
    this.sessions.clear(); this.ops.clear(); this.snapshotWrites = []; this.openProductIdWrites = [];
    this.teardownCalls = []; this.failTeardown = false; this.failCreate = false; this.createGate = null; this.failRead.clear();
    this.readGate = null; this.updateGate = null; this.failUpdate = null;
    this.listeners = []; this.currentTab = 'tab1';
  },
  activeOpsListeners(sessionId: string) {
    return this.listeners.filter(l => l.active && l.kind === 'ops' && l.sessionId === sessionId);
  },
  /** A session doc as the browser would have written it, for seeding. */
  seed(sessionId: string, fields: Session) {
    this.sessions.set(sessionId, stampAll({
      createdAt: ST, lastActiveAt: ST, browserConnectedAt: new Date(0), lastSeq: 0,
      expiresAt: new Date(Date.now() + 86_400_000), consentWrite: true, consentRead: false, ...fields,
    }));
  },
  /** What landing's writeOpBatch does for one op: gap-free seq, lastActiveAt and aiLastSeenAt stamped. */
  aiWrite(sessionId: string, op: string, payload: unknown, order: 'registration' | 'reverse' = 'registration') {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error('session_not_found');
    const seq = ((s.lastSeq as number) ?? 0) + 1;
    Object.assign(s, { lastSeq: seq, lastActiveAt: ts(new Date()), aiLastSeenAt: ts(new Date()) });
    const d: Op = { seq, op, payload };
    this.ops.set(sessionId, [...(this.ops.get(sessionId) ?? []), d]);
    const targets = this.activeOpsListeners(sessionId).filter(l => seq > l.afterSeq);
    if (order === 'reverse') targets.reverse();
    for (const l of targets) l.onNext(opsSnapshot([d]));
    return seq;
  },
  /** landing's teardownAiSession: deletes ops, snapshot and the session doc. */
  teardown(sessionId: string) {
    this.sessions.delete(sessionId); this.ops.delete(sessionId);
    for (const l of this.listeners) {
      if (l.active && l.kind === 'session' && l.sessionId === sessionId) l.onNext({ exists: () => false, data: () => undefined });
    }
  },
};

function opsSnapshot(docs: Op[]) {
  return { docChanges: () => docs.map(d => ({ type: 'added', doc: { data: () => d } })) };
}

const sessionIdOf = (r: Ref) => r.segs[1] as string;
const isSnapshotRef = (r: Ref) => r.segs.length === 4 && r.segs[2] === 'snapshot';

export const firestoreMock = {
  doc: (_db: unknown, ...segs: string[]): Ref => ({ kind: 'doc', segs }),
  collection: (_db: unknown, ...segs: string[]): Ref => ({ kind: 'col', segs }),
  where: (field: string, op: string, value: number): Where => ({ kind: 'where', field, op, value }),
  orderBy: () => ({ kind: 'orderBy' as const }),
  query: (col: Ref, ...constraints: Query['constraints']): Query => ({ kind: 'query', col, constraints }),
  serverTimestamp: () => ST,
  getDoc: async (ref: Ref) => {
    if (server.readGate) await server.readGate;
    if (server.failRead.has(sessionIdOf(ref))) throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
    const s = server.sessions.get(sessionIdOf(ref));
    return { exists: () => !!s, data: () => (s ? { ...s } : undefined) };
  },
  setDoc: async (ref: Ref, data: Record<string, unknown>) => {
    if (isSnapshotRef(ref)) {
      server.snapshotWrites.push({ sessionId: sessionIdOf(ref), productId: (data.product as { id: string }).id });
      return;
    }
    if (server.createGate) await server.createGate;
    if (server.failCreate) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
    server.sessions.set(sessionIdOf(ref), stampAll(data));
    server.openProductIdWrites.push({ sessionId: sessionIdOf(ref), value: data.openProductId });
  },
  updateDoc: async (ref: Ref, patch: Record<string, unknown>) => {
    if (server.updateGate) await server.updateGate;
    if (server.failUpdate) throw Object.assign(new Error(server.failUpdate), { code: server.failUpdate });
    const s = server.sessions.get(sessionIdOf(ref));
    if (!s) throw Object.assign(new Error('not-found'), { code: 'not-found' });
    Object.assign(s, stampAll(patch));
    if ('openProductId' in patch) server.openProductIdWrites.push({ sessionId: sessionIdOf(ref), value: patch.openProductId });
  },
  deleteDoc: async () => {},
  getDocs: async (q: Query) => {
    const wheres = q.constraints.filter((c): c is Where => c.kind === 'where');
    const ops = (server.ops.get(sessionIdOf(q.col)) ?? []).filter(o => wheres.every(w =>
      w.op === '>' ? o.seq > w.value : w.op === '<=' ? o.seq <= w.value : true));
    return { docs: ops.map(o => ({ data: () => o })) };
  },
  onSnapshot: (target: Ref | Query, onNext: (s: unknown) => void) => {
    if (target.kind === 'query') {
      const sessionId = sessionIdOf(target.col);
      const gt = target.constraints.find((c): c is Where => c.kind === 'where' && c.op === '>');
      const afterSeq = gt?.value ?? 0;
      const l: Listener = { tab: server.currentTab, kind: 'ops', sessionId, afterSeq, onNext, active: true };
      server.listeners.push(l);
      const initial = (server.ops.get(sessionId) ?? []).filter(o => o.seq > afterSeq);
      if (initial.length) queueMicrotask(() => { if (l.active) l.onNext(opsSnapshot(initial)); });
      return () => { l.active = false; };
    }
    const sessionId = sessionIdOf(target);
    const l: Listener = { tab: server.currentTab, kind: 'session', sessionId, afterSeq: 0, onNext, active: true };
    server.listeners.push(l);
    queueMicrotask(() => {
      const s = server.sessions.get(sessionId);
      if (l.active) l.onNext({ exists: () => !!s, data: () => s });
    });
    return () => { l.active = false; };
  },
};

/** firebase/functions: teardownAiSession is observable and can be made to fail. */
export const functionsMock = {
  httpsCallable: (_fns: unknown, name: string) => async (data: { sessionId: string }) => {
    if (name !== 'teardownAiSession') return { data: {} };
    server.teardownCalls.push(data.sessionId);
    if (server.failTeardown) throw new Error('internal');
    server.teardown(data.sessionId);
    return { data: { status: 'ok' } };
  },
};

/** A LockManager shared by every simulated tab in this jsdom; grants asynchronously. */
export function installFakeLocks() {
  const held: Array<{ name: string; mode: LockMode }> = [];
  const pending: Array<{ name: string; mode: LockMode }> = [];
  /** Every name requested, in order. */
  const requests: string[] = [];
  let nextQueryGate: Promise<void> | null = null;
  const fake = {
    request(name: string, opts: LockOptions, cb: (l: unknown) => Promise<unknown>) {
      requests.push(name);
      const h = { name, mode: opts.mode ?? 'exclusive' as LockMode };
      if (opts.signal?.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'));
      pending.push(h);
      return new Promise((resolve, reject) => {
        opts.signal?.addEventListener('abort', () => {
          const i = pending.indexOf(h);
          if (i >= 0) { pending.splice(i, 1); reject(new DOMException('aborted', 'AbortError')); }
        });
        queueMicrotask(() => {
          const i = pending.indexOf(h);
          if (i < 0) return;
          pending.splice(i, 1); held.push(h);
          void Promise.resolve(cb(h)).then(v => { held.splice(held.indexOf(h), 1); resolve(v); });
        });
      });
    },
    async query() {
      const gate = nextQueryGate;
      nextQueryGate = null;
      if (gate) await gate;
      return { held: held.map(h => ({ ...h })), pending: pending.map(h => ({ ...h })) };
    },
  };
  Object.defineProperty(navigator, 'locks', { value: fake, configurable: true });
  return {
    held, pending, requests,
    /** The next query() waits for `gate`, then reads the locks as they are then. */
    gateNextQuery: (gate: Promise<void>) => { nextQueryGate = gate; },
    /** Names held or pending now. */
    names: () => [...held, ...pending].map(h => h.name),
    remove: () => { delete (navigator as unknown as Record<string, unknown>).locks; },
  };
}
