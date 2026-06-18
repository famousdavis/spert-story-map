// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Centralized Firestore collection names for SPERT Story Map.
 *
 * Scope: the four primary top-level collections only. The shared ToS `users`
 * collection and session subcollection path segments (`ops`, `snapshot`,
 * `current`) are structural path components, not collection names, and remain
 * inline at their call sites.
 */
export const PROJECTS_COL = 'spertstorymap_projects';
export const PROFILES_COL = 'spertstorymap_profiles';
export const SETTINGS_COL = 'spertstorymap_settings';
export const SESSIONS_COL = 'anonymous_sessions';
