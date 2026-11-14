// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// v0.55.9 (BRIEF_product-rename-v3 D3, D13): sharing messages that never name the Scrum role
// ("the owner", never "the product owner"), and the Connect AI copy prompt.
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** The stored document `removeCollaborator`'s transaction reads. Per test. */
let storedDoc: Record<string, unknown> | null = null;

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  collection: (_db: unknown, col: string) => ({ col }),
  query: (...args: unknown[]) => ({ args }),
  where: (...args: unknown[]) => ({ args }),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  deleteField: () => ({ _deleteField: true }),
  onSnapshot: vi.fn(() => () => {}),
  arrayUnion: (...args: unknown[]) => ({ _arrayUnion: args }),
  runTransaction: async (_db: unknown, fn: (tx: { get: () => Promise<unknown>; update: () => void }) => Promise<void>) => fn({
    get: async () => ({ exists: () => storedDoc !== null, data: () => storedDoc ?? {} }),
    update: () => {},
  }),
  serverTimestamp: () => ({ _methodName: 'serverTimestamp' }),
}));
vi.mock('../lib/firebase', () => ({ db: {} }));

const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: unknown) => { store[k] = String(v); },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  key: (i: number) => Object.keys(store)[i] ?? null,
  get length() { return Object.keys(store).length; },
});

const { createFirestoreDriver } = await import('../lib/firestoreDriver');
const { mapInvitationError } = await import('../lib/invitationErrors');
const { buildCopyPrompt } = await import('../components/ConnectAI/copyPrompt');

beforeEach(() => { storedDoc = null; });

describe('removing a member: the Share panel\'s errors (D3)', () => {
  const remove = (target: string) => createFirestoreDriver('me').removeCollaborator('p1', target);

  it('yourself (A61)', async () => {
    await expect(remove('me')).rejects.toThrow(/^Cannot remove yourself from a product\.$/);
  });

  it('a product that is gone (A62)', async () => {
    await expect(remove('them')).rejects.toThrow(/^Product not found\.$/);
  });

  it('when you are not its owner: "the owner", not the Scrum role (A63)', async () => {
    storedDoc = { owner: 'boss', members: { boss: 'owner', me: 'editor', them: 'viewer' } };
    await expect(remove('them')).rejects.toThrow(/^Only the owner can remove members\.$/);
  });
});

describe('sending an invitation: the Share panel\'s errors (D3)', () => {
  it('not found (A71) and not the owner (A72)', () => {
    expect(mapInvitationError({ code: 'functions/not-found' })).toBe('Product not found or you are not the owner.');
    expect(mapInvitationError({ code: 'functions/permission-denied' })).toBe('Only the owner can send invitations.');
  });
});

// v0.55.10 (R47): SPERT's AI service renamed the read tool to storymap_get_product, so nothing the AI
// reads says "project" and the prompt no longer explains the word.
describe('the Connect AI copy prompt (D13, R29, R47)', () => {
  const prompt = buildCopyPrompt('CODE');
  const flat = prompt.replace(/\s+/g, ' ');
  // R31's words, written out here rather than imported: a typo in the shared constant must fail.
  const definition = 'A product can be an application, a service, an internal capability or any other initiative.';
  const callIt = 'When you talk to me, call it a product.';

  it('opens with what a product is, then asks the AI to call it a product', () => {
    expect(flat.startsWith(`I want to build a story map for a product using SPERT Story Map. ${definition} ${callIt}`)).toBe(true);
  });

  // 20 since v0.55.11: B15's R-10 sentence (a new pairing code may be another product) names it once more.
  it('names storymap_get_product 20 times and storymap_get_project never, and says "project" nowhere', () => {
    expect(prompt.match(/storymap_get_product/g)).toHaveLength(20);
    expect(prompt.match(/storymap_get_project/g)).toBeNull();
    expect(flat.match(/\bprojects?\b/gi)).toBeNull();
  });

  it('the five tiled-work rows now say product', () => {
    expect(flat).toContain('call get_session_info to confirm which product is open.');
    expect(flat).toContain("Call storymap_get_product before any sizing. You need the product's sizeMapping");
    expect(flat).toContain("appear in the product's sizeMapping.");
    expect(flat).toContain('this product may use entirely different labels.');
    expect(flat).toContain('invalid sizes for products with custom size labels.');
  });
});
