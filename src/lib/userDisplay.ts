// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { denormalizeLastFirst } from './auth-name';

/**
 * Normalize a Firebase displayName to "First MI Last" reading order.
 * Delegates to denormalizeLastFirst for correct multi-comma handling.
 * See LESSONS-LEARNED §5 and §19.
 */
export function normalizeDisplayName(displayName: string | null | undefined): string {
  return denormalizeLastFirst((displayName ?? '').trim());
}

/**
 * Extract the first name token from a normalized display name,
 * falling back to the email local-part.
 */
export function getFirstName(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string {
  const normalized = normalizeDisplayName(displayName);
  const first = normalized.split(/\s+/)[0] ?? '';
  return first || email?.split('@')[0] || '';
}
