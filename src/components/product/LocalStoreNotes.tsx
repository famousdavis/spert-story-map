// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// v0.56.1 (R71 R-5): while signed in with Local storage, the Products page says where its products are.

export const LOCAL_SIGNED_IN_LINE =
  'Products on this page are kept in this browser, not in your cloud account. Anyone who uses this browser can see them.';

export function LocalSignedInLine({ show }: { show: boolean }) {
  if (!show) return null;
  return <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">{LOCAL_SIGNED_IN_LINE}</p>;
}
