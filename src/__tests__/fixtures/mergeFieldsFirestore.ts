// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Ported from SPERT Forecaster 38f1a63 `src/shared/firebase/__fakes__/mergefields-firestore.ts` for Story Map v0.55.14,
// with what Story Map's production paths have and that fake lacks: a get of a missing project document is refused
// (permission-denied, as the rules' `allow get` reads resource.data.members); the members query on projects; a read counter;
// an offline switch (reads fail); `{ merge: true }` as a deep merge (the original treats it as a whole replace); and a mask
// holding a parent and its child refused with invalid-argument, as the SDK refuses it.
// Holds (Exec-RBP-2, review -01): `holdReads` makes a read take its snapshot when it is called and return only when
// released, as the SDK computes a snapshot before a later setDoc is queued and delivers it afterwards; `holdWrites` makes
// a write apply when it is called and settle only when released, as a write the SDK has been handed is visible to later
// reads before the server acknowledges it.
// Offline as the SDK measured it (Exec-RBP-2, review -03; Opus-PR242-1 E and F on the emulator, memoryLocalCache): a
// document this client has read is served from its cache (`metadata.fromCache: true`), one it never read throws, the
// members query resolves with no documents, and the `…FromServer` reads throw. A write by this client updates its cached
// copy, as the SDK applies a local write to its cache; the stand-in is one client, whichever driver writes.
// `setOfflineAfterReads(n)` drops the connection after the next n reads (a network lost in the middle of an upload).
//
// A test fake of the Firestore Web SDK's `setDoc(ref, data, { mergeFields })` (v0.50.0), built to
// the behaviour the R2 plan reviews measured on the real SDK (firebase 12.12.1):
// - only masked fields change, each at its own (nested) path;
// - a masked field absent from the data THROWS ("specified in your field mask but missing from
//   your input data");
// - a deleteField() sentinel inside the mask removes that field; one outside the mask changes
//   nothing (the SDK drops it);
// - the sentinel is known BY IDENTITY: a plain object shaped like one (what sanitizeForFirestore
//   makes of it) is stored as a map, as the real SDK stores it.
// GanttApp's R2 fakes ignored `merge`, so a write that could never clear the map passed every
// test (CHAR-REPORT §E, class 3). This one must not.
//
// MUTANT is the switch the mutation runs flip: 'ignore-mask' applies every field of the data,
// 'shape-sentinel' treats any `{ _methodName: 'deleteField' }` as a delete. At 'none' it is the
// SDK's behaviour; a test must go red under each of the other two.

export const MUTANT = 'none' as 'none' | 'ignore-mask' | 'shape-sentinel'

export class FakeFieldPath {
  readonly segments: string[]
  constructor(...segments: string[]) {
    this.segments = segments
  }
}

type Doc = Record<string, unknown>

const isPlainObject = (v: unknown): v is Doc => typeof v === 'object' && v !== null && !Array.isArray(v)

export function createMergeFieldsFirestore() {
  const docs = new Map<string, Doc>()
  const sentinels = new Set<object>()
  const writes: { path: string; data: unknown; mask: string[][] | null }[] = []
  let refusal: ((path: string, data: unknown) => Error | null) | null = null
  let reads = 0
  let offline = false
  /** What this client last read or wrote at each path (null: read, and missing): the SDK's memory cache. */
  const cache = new Map<string, Doc | null>()
  let offlineAfter: number | null = null
  const countRead = () => {
    reads++
    if (offlineAfter !== null && --offlineAfter <= 0) {
      offline = true
      offlineAfter = null
    }
  }
  /** Every write to the stored document goes through here, so a cached copy follows this client's writes. */
  const store = (path: string, value: Doc) => {
    docs.set(path, value)
    if (cache.has(path)) cache.set(path, structuredClone(value))
  }
  const gate = () => {
    let open = () => {}
    const promise = new Promise<void>((r) => { open = r })
    return { promise, open }
  }
  let readGate: ReturnType<typeof gate> | null = null
  let writeGate: ReturnType<typeof gate> | null = null
  const hold = (which: 'read' | 'write') => {
    const g = gate()
    if (which === 'read') readGate = g
    else writeGate = g
    return () => {
      if (which === 'read' && readGate === g) readGate = null
      if (which === 'write' && writeGate === g) writeGate = null
      g.open()
    }
  }
  const perm = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })

  const deleteField = () => {
    const sentinel = Object.freeze({ _methodName: 'deleteField' })
    sentinels.add(sentinel)
    return sentinel
  }
  const isDelete = (v: unknown) => {
    if (MUTANT === 'shape-sentinel') return isPlainObject(v) && v._methodName === 'deleteField'
    return typeof v === 'object' && v !== null && sentinels.has(v)
  }

  const read = (obj: unknown, segs: string[]): { found: boolean; value?: unknown } => {
    let cur: unknown = obj
    for (const s of segs) {
      if (!isPlainObject(cur) || !Object.prototype.hasOwnProperty.call(cur, s)) return { found: false }
      cur = cur[s]
    }
    return { found: true, value: cur }
  }
  const write = (obj: Doc, segs: string[], value: unknown) => {
    let cur = obj
    for (const s of segs.slice(0, -1)) {
      if (!isPlainObject(cur[s])) cur[s] = {}
      cur = cur[s] as Doc
    }
    cur[segs[segs.length - 1]!] = structuredClone(value)
  }
  const remove = (obj: Doc, segs: string[]) => {
    const parent = read(obj, segs.slice(0, -1))
    if (parent.found && isPlainObject(parent.value)) delete parent.value[segs[segs.length - 1]!]
  }
  const deepMergeAll = (target: Doc, data: Doc) => {
    for (const [k, v] of Object.entries(data)) {
      if (isDelete(v)) delete target[k]
      else if (isPlainObject(v)) {
        if (!isPlainObject(target[k])) target[k] = {}
        deepMergeAll(target[k] as Doc, v)
      } else target[k] = structuredClone(v)
    }
  }

  /** The SDK refuses a mask holding a parent and its child, the whole write (invalid-argument). */
  const refuseOverlap = (mask: string[][]) => {
    for (const a of mask) for (const b of mask) {
      if (a.length < b.length && a.every((x, i) => x === b[i])) throw Object.assign(new Error(`Field '${a.join('.')}' overlaps '${b.join('.')}'`), { code: 'invalid-argument' })
    }
  }
  /** `{ merge: true }`: a deep merge, as the SDK does it (the 38f1a63 fake replaced the document). */
  const mergeWrite = (path: string, data: Doc) => {
    writes.push({ path, data, mask: null })
    const cur: Doc = structuredClone(docs.get(path) ?? {})
    deepMergeAll(cur, data)
    store(path, cur)
  }

  /** A write applied to the stored document: whole without a mask, else only the masked fields. */
  const apply = (path: string, data: Doc, mask: string[][] | null) => {
    const current: Doc = structuredClone(docs.get(path) ?? {})
    if (!mask) {
      store(path, structuredClone(data))
      return
    }
    if (MUTANT === 'ignore-mask') {
      deepMergeAll(current, data)
      store(path, current)
      return
    }
    for (const segs of mask) {
      const { found, value } = read(data, segs)
      if (!found) {
        throw new Error(`Field '${segs.join('.')}' is specified in your field mask but missing from your input data.`)
      }
      if (isDelete(value)) remove(current, segs)
      else write(current, segs, value)
    }
    store(path, current)
  }

  const setDoc = async (ref: { path: string }, data: Doc, options?: { mergeFields?: (string | FakeFieldPath)[]; merge?: boolean }) => {
    const mask = options?.mergeFields?.map((f) => (typeof f === 'string' ? f.split('.') : f.segments)) ?? null
    if (mask) refuseOverlap(mask)
    if (!mask && options?.merge) return mergeWrite(ref.path, data)
    writes.push({ path: ref.path, data, mask })
    const held = writeGate
    const refused = refusal?.(ref.path, data)
    if (refused) {
      if (held) await held.promise
      throw refused
    }
    apply(ref.path, data, mask)
    if (held) await held.promise
  }

  const snapshot = (data: Doc | null, fromCache: boolean) => ({
    exists: () => data !== null,
    data: () => (data === null ? undefined : structuredClone(data)),
    metadata: { fromCache },
  })
  const getDoc = async (ref: { path: string }) => {
    const held = readGate
    const answer = (() => {
      if (offline) {
        if (!cache.has(ref.path)) return Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' })
        return snapshot(cache.get(ref.path) ?? null, true)
      }
      if (ref.path.startsWith('spertstorymap_projects/') && !docs.has(ref.path)) return perm()
      const data = docs.has(ref.path) ? structuredClone(docs.get(ref.path)!) : null
      cache.set(ref.path, data === null ? null : structuredClone(data))
      return snapshot(data, false)
    })()
    countRead()
    if (held) await held.promise
    if (answer instanceof Error) throw answer
    return answer
  }
  /** The members query: query(collection(db, col), where(`members.${uid}`, 'in', roles)). */
  const collection = (_db: unknown, name: string) => ({ col: name })
  const where = (field: string, op: string, value: unknown) => ({ field, op, value })
  const query = (c: { col: string }, w: { field: string; op: string; value: unknown }) => ({ ...c, w })
  const getDocs = async (q: { col: string; w: { field: string; op: string; value: string[] } }) => {
    const wasOffline = offline
    countRead()
    const uid = q.w.field.replace(/^members\./, '')
    const out = [...docs.entries()].filter(([p, d]) => p.startsWith(q.col + '/') && q.w.value.includes((d.members as Record<string, string> | undefined)?.[uid] ?? ''))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([p, d]) => ({ id: p.split('/').pop()!, data: () => structuredClone(d) }))
    if (wasOffline) {
      // the SDK resolves a query offline from its cache, without throwing (Exec-RBP-1 pre-flight, emulator)
      return { docs: [], size: 0, empty: true, forEach: () => {}, metadata: { fromCache: true } }
    }
    for (const o of out) cache.set(`${q.col}/${o.id}`, o.data()) // a query's documents enter the cache, as in the SDK
    return { docs: out, size: out.length, empty: out.length === 0, forEach: (f: (x: (typeof out)[number]) => void) => out.forEach(f), metadata: { fromCache: false } }
  }
  const unavailable = () => Object.assign(new Error('Failed to get documents from server.'), { code: 'unavailable' })
  const getDocFromServer = async (ref: { path: string }) => { if (offline) { countRead(); throw unavailable() } return getDoc(ref) }
  const getDocsFromServer = async (q: Parameters<typeof getDocs>[0]) => { if (offline) { countRead(); throw unavailable() } return getDocs(q) }

  return {
    docs,
    writes,
    deleteField,
    setDoc,
    getDoc,
    getDocs, getDocFromServer, getDocsFromServer, collection, where, query,
    get reads() { return reads },
    setOffline(v: boolean) { offline = v },
    /** The connection drops after the next `n` reads (online until then). */
    setOfflineAfterReads(n: number) { offlineAfter = n },
    FieldPath: FakeFieldPath,
    doc: (_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}` }),
    /** Makes setDoc reject (the write is still recorded) while `fn` returns an error. */
    refuseWhen(fn: ((path: string, data: unknown) => Error | null) | null) {
      refusal = fn
    },
    /** Reads called from now take their snapshot at once and return when the returned function is called. */
    holdReads: () => hold('read'),
    /** Writes called from now apply at once and settle when the returned function is called. */
    holdWrites: () => hold('write'),
    reset() {
      docs.clear()
      sentinels.clear()
      writes.length = 0
      refusal = null
      reads = 0
      offline = false
      cache.clear()
      offlineAfter = null
      readGate?.open()
      writeGate?.open()
      readGate = null
      writeGate = null
    },
  }
}
