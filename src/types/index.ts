// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Core domain types for SPERT Story Map.
 *
 * Hierarchy: Product → Theme → Backbone → RibItem
 * Each product also contains Releases, Sprints, and SizeMappings.
 */

// ---------------------------------------------------------------------------
// Enums & literals
// ---------------------------------------------------------------------------

export type Size = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'XXXL' | null;

export type Category = 'core' | 'non-core';

export type StorageMode = 'local' | 'cloud';

export type MemberRole = 'owner' | 'editor' | 'viewer';

export type ChangeLogOp =
  | 'create'
  | 'add'
  | 'delete'
  | 'import'
  | 'cloud-migration'
  | 'duplicate'
  | 'split'
  | 'update';

export type ChangeLogEntity =
  | 'product'
  | 'theme'
  | 'backbone'
  | 'rib'
  | 'release'
  | 'sprint';

export type ColorKey =
  | 'blue'
  | 'teal'
  | 'violet'
  | 'rose'
  | 'amber'
  | 'emerald'
  | 'indigo'
  | 'orange';

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

export interface SizeMapping {
  label: string;
  points: number;
}

export interface ReleaseAllocation {
  releaseId: string;
  percentage: number;
  memo?: string;
}

export interface ProgressEntry {
  sprintId: string;
  releaseId: string;
  percentComplete: number | null;
  comment?: string;
  updatedAt?: string;
}

/**
 * The only part of a rib the progress calculations actually read.
 *
 * Declared separately, and with `progressHistory` OPTIONAL, because a rib that
 * has never been assessed legitimately has none — the helpers all open with an
 * `if (!rib.progressHistory)` guard for exactly that. Taking this instead of a
 * full RibItem is what lets those functions be called with the minimum they
 * need rather than forcing every caller to fabricate the rest of a rib.
 */
export interface ProgressSource {
  progressHistory?: ProgressEntry[];
}

export interface RibItem {
  id: string;
  name: string;
  description: string;
  order: number;
  size: Size;
  category: Category;
  releaseAllocations: ReleaseAllocation[];
  progressHistory: ProgressEntry[];
  notes?: string;
  /** Optional per-card color flag for visual triage (e.g., suspected unneeded). */
  cardColor?: string;
}

export interface Backbone {
  id: string;
  name: string;
  description?: string;
  order: number;
  ribItems: RibItem[];
}

export interface Theme {
  id: string;
  name: string;
  order: number;
  color?: ColorKey;
  backboneItems: Backbone[];
}

export interface Release {
  id: string;
  name: string;
  description?: string;
  order: number;
  /**
   * Null (not absent) when a release is created — both `addRelease` and the
   * DataSection sample write `targetDate: null` explicitly. Consumers guard
   * with `release.targetDate && ...`, which treats null and undefined alike.
   */
  targetDate?: string | null;
}

export interface Sprint {
  id: string;
  name: string;
  order: number;
  /**
   * Null until a date is set. addSprint writes null for the first sprint —
   * calculateNextSprintEndDate has no previous date to extend from — so `string`
   * alone was never true. Same class as Release.targetDate (v0.49.18); every
   * consumer already guards with a truthiness check.
   */
  endDate: string | null;
}

export interface ChangeLogEntry {
  t: number;
  op: ChangeLogOp;
  entity?: ChangeLogEntity;
  id?: string;
  uid?: string;
  source?: string;
  /**
   * Per-entry uniqueness nonce (v0.33.0+). Distinguishes two entries with the
   * same (t, op, entity, id, uid, source) tuple — notably bulk-delete entries
   * that omit id/uid/source. Optional for backward compatibility with
   * pre-v0.33.0 imports.
   */
  seq?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
  sizeMapping: SizeMapping[];
  releases: Release[];
  sprints: Sprint[];
  themes: Theme[];
  sprintCadenceWeeks?: number;
  releaseCardOrder?: Record<string, string[]>;
  sizingCardOrder?: Record<string, string[]>;

  /**
   * User-defined meanings for the card color flags, shared across the Map and
   * Sizing tabs. Keyed by RibCardColorKey (e.g. 'rose', 'orange'); value is the
   * label shown in the color legend. Only colors actually in use are surfaced.
   */
  cardColorLabels?: Record<string, string>;

  // Academic integrity metadata
  _originRef?: string;
  _storageRef?: string;
  _changeLog?: ChangeLogEntry[];
  _exportedBy?: string;
  _exportedById?: string;

  // Cloud-only ownership fields (never written by client save)
  owner?: string;
  members?: Record<string, MemberRole>;

  /**
   * Client-side aliases for `owner` / `members`, re-attached by the Firestore
   * driver after `stripFirestoreFields` removes the raw fields on load
   * (`loadProduct`, `loadProductIndex`, and the `onProductChange` echo).
   *
   * The alias is what the UI reads — `owner` / `members` are absent from a
   * loaded product, so "did you mean 'owner'?" is NOT a valid fix for a type
   * error on these. Rewriting `_owner` to `owner` silently breaks ownership
   * checks and role discrimination in the Sharing UI. See CLAUDE.md #33(f).
   */
  _owner?: string | null;
  _members?: Record<string, MemberRole>;
}

// ---------------------------------------------------------------------------
// Updater pattern
// ---------------------------------------------------------------------------

/** Functional updater: accepts a transform function or a full replacement. */
export type ProductUpdater = ((prev: Product) => Product) | Product;

// ---------------------------------------------------------------------------
// Outlet context (shared between ProductLayout and all page views)
// ---------------------------------------------------------------------------

export interface OutletContextValue {
  product: Product;
  updateProduct: (updater: ProductUpdater) => void;
  undo: () => void;
  redo: () => void;
}

// ---------------------------------------------------------------------------
// Storage driver interface
// ---------------------------------------------------------------------------

export interface StorageDriver {
  mode: StorageMode;
  loadProductIndex(): Promise<Product[]>;
  loadProduct(id: string): Promise<Product | null>;
  createProduct(product: Product, options?: { throwOnError?: boolean }): Promise<void>;
  saveProduct(product: Product): Promise<void>;
  saveProductImmediate(product: Product): Promise<void>;
  replaceProduct(product: Product): Promise<void>;
  deleteProduct(id: string): Promise<void>;
  loadPreferences(): Promise<UserSettings>;
  savePreferences(prefs: UserSettings): Promise<void>;
  getWorkspaceId(): string;
  /**
   * Subscribe to remote document changes for a single product.
   *
   * `onError` (optional) is invoked with the underlying Firestore error when
   * the listener fails — most importantly, `permission-denied` when a
   * collaborator is removed mid-session. When omitted, errors route to the
   * driver's save-error subscribers as a fallback (preserves pre-v0.33.0
   * behaviour for callers that don't opt in).
   *
   * Returns an unsubscribe function.
   */
  onProductChange(
    id: string,
    callback: (product: Product) => void,
    onError?: (error: unknown) => void,
  ): () => void;
  /**
   * Subscribe to write failures (storage quota, permission denied, etc.).
   * Multi-subscriber: multiple components can register independently.
   * Returns an unsubscribe function — call on effect cleanup.
   */
  // `unknown`, not `Error`: the source is a catch block, which can receive any
  // thrown value. Both subscribers ignore the argument and only flip a banner.
  onSaveError(callback: (error: unknown) => void): () => void;
  flushPendingSaves(): void;
  cancelPendingSaves(): void;
  /**
   * Detach every active listener subscribed via this driver. Called by
   * signOutCleanup before firebaseSignOut so a listener cannot fire
   * `permission-denied` after credentials are revoked. No-op for the
   * local driver. (Audit L3.)
   */
  tearDownListeners(): void;
  listPendingInvites(productId: string): Promise<PendingInvite[]>;
  removeCollaborator(productId: string, uid: string): Promise<void>;
  revokeInvite(tokenId: string): Promise<void>;
  resendInvite(tokenId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Context value types
// ---------------------------------------------------------------------------

export interface AuthContextValue {
  user: { uid: string; displayName: string | null; email: string | null } | null;
  loading: boolean;
  firebaseAvailable: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  signOut: () => Promise<void>;
}

export interface StorageContextValue {
  driver: StorageDriver | null;
  mode: StorageMode;
  switchMode: (newMode: StorageMode) => void;
  isCloudAvailable: boolean;
  storageReady: boolean;
}

// ---------------------------------------------------------------------------
// Settings & profiles
// ---------------------------------------------------------------------------

export interface UserSettings {
  exportName?: string;
  exportId?: string;
  projectOrder?: string[];
  _hasUploadedToCloud?: boolean;
  suppressLocalStorageWarning?: boolean;
  [key: string]: unknown;
}

export interface UserProfile {
  displayName: string;
  email: string;
  updatedAt?: unknown; // Firestore Timestamp
}

export interface TosAcceptance {
  acceptedAt: unknown; // Firestore Timestamp
  tosVersion: string;
  privacyPolicyVersion: string;
  authProvider: string;
  appId?: string;
}

// ---------------------------------------------------------------------------
// Theme color system
// ---------------------------------------------------------------------------

export interface ThemeColorOption {
  key: ColorKey;
  solid: string;
  light: string;
  dot: string;
  swatch: string;
}

// ---------------------------------------------------------------------------
// Rib iteration context
// ---------------------------------------------------------------------------

export interface RibContext {
  theme: Theme;
  backbone: Backbone;
}

// ---------------------------------------------------------------------------
// Invitation types
// ---------------------------------------------------------------------------

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface PendingInvite {
  tokenId: string;
  inviteeEmail: string;
  role: 'editor' | 'viewer';
  status: InvitationStatus;
  createdAt: number;          // millis — converted from Firestore Timestamp
  expiresAt: number;          // millis
  lastEmailSentAt: number;    // millis
  modelId: string;
  modelName: string;
  emailSendCount: number;
  inviterUid: string;
  appId: string;
  isVoting: boolean;
}

export interface SpertModelsChangedDetail {
  claimed: { appId: string; modelId: string; modelName: string }[];
}

// Callable I/O types
export interface SendInvitationEmailInput {
  appId: 'spertstorymap';  // string literal — NOT TOS_APP_ID (Lesson 15)
  modelId: string;
  emails: string[];
  role: 'editor' | 'viewer';
  isVoting: false;          // always false — no voting model in Story Map
}

export interface SendInvitationEmailResult {
  added: string[];
  invited: string[];
  failed: { email: string; reason: string }[];
}

export interface ClaimPendingInvitationsResult {
  claimed: { appId: string; modelId: string; modelName: string }[];
}

export interface RevokeInviteInput { tokenId: string }
export interface ResendInviteInput { tokenId: string }
export interface RevokeInviteResult { revoked: true }
export interface ResendInviteResult { resent: true; emailSendCount: number }

// ---------------------------------------------------------------------------
// Import system types (v0.32.0)
// ---------------------------------------------------------------------------

export interface ParsedImport {
  products: Product[];
  fileName: string;
}

export interface ImportConflict {
  type: 'id' | 'name';
  incomingProduct: Product;
  existingProduct: Product;
  /** ID of the existing product at Layer 1 detection time. Used in Layer 2 drift detection. */
  originalExistingId: string;
}

export type ConflictAction = 'skip' | 'replace' | 'copy';

export interface ImportDecision {
  importedProductId: string;
  kind: 'id' | 'name';
  originalExistingId: string;
  action: ConflictAction;
}

export interface ImportOutcome {
  added: number;
  replaced: number;
  copied: number;
  skipped: number;
  driftSkipped: Array<{ productName: string; reason: string }>;
  errors: Array<{ productName: string; reason: string }>;
}

export type ImportPhase =
  | { tag: 'idle' }
  | {
      tag: 'preview';
      parsed: ParsedImport;
      conflicts: ImportConflict[];
      decisions: ImportDecision[];
      /**
       * Monotonically increasing counter incremented by useImportState on every
       * file pick. Used as the React `key` on ImportPreviewBody to force a remount
       * (and re-fire the heading-focus useEffect) even when the user picks two
       * files with identical names in succession.
       */
      pickSeq: number;
    }
  | { tag: 'applying' }
  | { tag: 'done'; outcome: ImportOutcome }
  | { tag: 'error'; message: string };
