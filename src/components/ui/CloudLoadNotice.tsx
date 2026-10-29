// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useSyncExternalStore } from 'react';
import { dismissGuardedLoad, isGuardedLoad, subscribeGuardedLoads } from '../../lib/cloudLoadNotices';

interface CloudLoadNoticeProps {
  productId: string;
  productName: string;
}

/**
 * Shown when part of a cloud project could not be read and was left out so the
 * project could open (see `guardCloudProduct`). Names the project, never the
 * value. The next save writes the project without the part that was left out.
 */
export default function CloudLoadNotice({ productId, productName }: CloudLoadNoticeProps) {
  const shown = useSyncExternalStore(subscribeGuardedLoads, () => isGuardedLoad(productId));
  if (!shown) return null;
  return (
    <div role="status" className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700/50 px-6 py-2 flex items-center justify-center gap-3">
      <p className="text-xs text-amber-800 dark:text-amber-200">
        Part of &ldquo;{productName || 'this project'}&rdquo; could not be read and was left out so the project could open. If you make changes, that part will not be kept.
      </p>
      <button
        type="button"
        onClick={() => dismissGuardedLoad(productId)}
        className="text-xs font-medium text-amber-800 dark:text-amber-200 underline hover:no-underline flex-shrink-0"
      >
        Dismiss
      </button>
    </div>
  );
}
