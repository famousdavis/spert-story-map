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
  | 'duplicate';

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

export interface RibItem {
  id: string;
  name: string;
  description: string;
  order: number;
  size: Size;
  category: Category;
  releaseAllocations: ReleaseAllocation[];
  progressHistory: ProgressEntry[];
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
  targetDate?: string;
}

export interface Sprint {
  id: string;
  name: string;
  order: number;
  endDate: string;
}

export interface ChangeLogEntry {
  t: number;
  op: ChangeLogOp;
  entity?: ChangeLogEntity;
  id?: string;
  uid?: string;
  source?: string;
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

  // Academic integrity metadata
  _originRef?: string;
  _storageRef?: string;
  _changeLog?: ChangeLogEntry[];
  _exportedBy?: string;
  _exportedById?: string;

  // Cloud-only ownership fields (never written by client save)
  owner?: string;
  members?: Record<string, MemberRole>;
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
  createProduct(product: Product): Promise<void>;
  saveProduct(product: Product): Promise<void>;
  saveProductImmediate(product: Product): Promise<void>;
  replaceProduct(product: Product): Promise<void>;
  deleteProduct(id: string): Promise<void>;
  loadPreferences(): Promise<UserSettings>;
  savePreferences(prefs: UserSettings): Promise<void>;
  getWorkspaceId(): string;
  onProductChange(id: string, callback: (product: Product) => void): () => void;
  onSaveError(callback: (error: Error) => void): void;
  flushPendingSaves(): void;
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
  [key: string]: unknown;
}

export interface UserProfile {
  displayName: string;
  email: string;
  lastLogin?: unknown; // Firestore Timestamp
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
