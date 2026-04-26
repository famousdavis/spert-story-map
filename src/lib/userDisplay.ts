// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Normalize a Firebase displayName to "First MI Last" reading order.
 * Microsoft Entra ID returns "Last, First MI" — swap on comma detection.
 * Google and most providers return "First Last" already — passthrough.
 * Empty/null → ''.
 */
export function normalizeDisplayName(displayName: string | null | undefined): string {
  const raw = (displayName ?? '').trim();
  if (!raw) return '';
  if (!raw.includes(',')) return raw;
  const [last, firstAndMiddle] = raw.split(',').map(s => s.trim());
  if (!firstAndMiddle) return last ?? '';
  if (!last) return firstAndMiddle;
  return `${firstAndMiddle} ${last}`;
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
