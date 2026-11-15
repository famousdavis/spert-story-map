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

/**
 * Cloud storage with no products in the cloud, while this browser's Local storage holds some (v0.56.1,
 * review -01). Since R71 those are everyone's who uses this browser, so the words no longer ask the
 * person to upload them all.
 */
function localOrphanText(count: number): string {
  const held = count === 1 ? '1 product, which may be someone else’s' : `${count} products, which may include other people’s`;
  return `Your cloud account has no products. This browser’s Local storage holds ${held}. To upload any that are yours, go to App Settings → Storage, choose Local, then choose Cloud again and tick only your own.`;
}

export function LocalOrphanNote({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-lg px-4 py-3 mb-6">
      <p className="text-xs text-blue-800 dark:text-blue-200">{localOrphanText(count)}</p>
    </div>
  );
}
