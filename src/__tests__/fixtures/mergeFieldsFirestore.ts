// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Ported from SPERT Forecaster 38f1a63 `src/shared/firebase/__fakes__/mergefields-firestore.ts` for Story Map v0.55.14,
// with what Story Map's production paths have and that fake lacks: a get of a missing project document is refused
// (permission-denied, as the rules' `allow get` reads resource.data.members); the members query on projects; a read counter;
// an offline switch (reads fail); `{ merge: true }` as a deep merge (the original treats it as a whole replace); and a mask
// holding a parent and its child refused with invalid-argument, as the SDK refuses it.
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
    docs.set(path, cur)
  }

  const setDoc = async (ref: { path: string }, data: Doc, options?: { mergeFields?: (string | FakeFieldPath)[]; merge?: boolean }) => {
    const mask = options?.mergeFields?.map((f) => (typeof f === 'string' ? f.split('.') : f.segments)) ?? null
    if (mask) refuseOverlap(mask)
    if (!mask && options?.merge) return mergeWrite(ref.path, data)
    writes.push({ path: ref.path, data, mask })
    const refused = refusal?.(ref.path, data)
    if (refused) throw refused
    const current: Doc = structuredClone(docs.get(ref.path) ?? {})
    if (!mask) {
      docs.set(ref.path, structuredClone(data))
      return
    }
    if (MUTANT === 'ignore-mask') {
      deepMergeAll(current, data)
      docs.set(ref.path, current)
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
    docs.set(ref.path, current)
  }

  const getDoc = async (ref: { path: string }) => {
    reads++
    if (offline) throw Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' })
    if (ref.path.startsWith('spertstorymap_projects/') && !docs.has(ref.path)) throw perm()
    return { exists: () => docs.has(ref.path), data: () => structuredClone(docs.get(ref.path)) }
  }
  /** The members query: query(collection(db, col), where(`members.${uid}`, 'in', roles)). */
  const collection = (_db: unknown, name: string) => ({ col: name })
  const where = (field: string, op: string, value: unknown) => ({ field, op, value })
  const query = (c: { col: string }, w: { field: string; op: string; value: unknown }) => ({ ...c, w })
  const getDocs = async (q: { col: string; w: { field: string; op: string; value: string[] } }) => {
    reads++
    const uid = q.w.field.replace(/^members\./, '')
    const out = [...docs.entries()].filter(([p, d]) => p.startsWith(q.col + '/') && q.w.value.includes((d.members as Record<string, string> | undefined)?.[uid] ?? ''))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([p, d]) => ({ id: p.split('/').pop()!, data: () => structuredClone(d) }))
    if (offline) {
      // the SDK resolves a query offline from its cache, without throwing (Exec-RBP-1 pre-flight, emulator)
      return { docs: [], size: 0, empty: true, forEach: () => {}, metadata: { fromCache: true } }
    }
    return { docs: out, size: out.length, empty: out.length === 0, forEach: (f: (x: (typeof out)[number]) => void) => out.forEach(f), metadata: { fromCache: false } }
  }
  const unavailable = () => Object.assign(new Error('Failed to get documents from server.'), { code: 'unavailable' })
  const getDocFromServer = async (ref: { path: string }) => { if (offline) { reads++; throw unavailable() } return getDoc(ref) }
  const getDocsFromServer = async (q: Parameters<typeof getDocs>[0]) => { if (offline) { reads++; throw unavailable() } return getDocs(q) }

  return {
    docs,
    writes,
    deleteField,
    setDoc,
    getDoc,
    getDocs, getDocFromServer, getDocsFromServer, collection, where, query,
    get reads() { return reads },
    setOffline(v: boolean) { offline = v },
    FieldPath: FakeFieldPath,
    doc: (_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}` }),
    /** Makes setDoc reject (the write is still recorded) while `fn` returns an error. */
    refuseWhen(fn: ((path: string, data: unknown) => Error | null) | null) {
      refusal = fn
    },
    reset() {
      docs.clear()
      sentinels.clear()
      writes.length = 0
      refusal = null
      reads = 0
      offline = false
    },
  }
}
