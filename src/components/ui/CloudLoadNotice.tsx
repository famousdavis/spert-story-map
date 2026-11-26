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
 * The frame's caution notice (v0.57.0), below the product's heading row: it belongs to this product, on every tab.
 *
 * Shown when part of a project could not be read and was left out so the project
 * could open, on either read path (see `guardCloudProduct`). Names the project, never the
 * value. The next save removes the part that was left out. The cloud driver raises this
 * only when that is true: `createdAt` and `_changeLog` stay stored, and raise nothing.
 */
export default function CloudLoadNotice({ productId, productName }: CloudLoadNoticeProps) {
  const shown = useSyncExternalStore(subscribeGuardedLoads, () => isGuardedLoad(productId));
  if (!shown) return null;
  return (
    <div role="status" className="sf-notice sf-notice--caution sf-below">
      <p>
        Part of &ldquo;{productName || 'this product'}&rdquo; could not be read and was left out so the product could open. If you make changes, that part will not be kept.
      </p>
      <button
        type="button"
        onClick={() => dismissGuardedLoad(productId)}
        className="sf-notice-dismiss"
      >
        Dismiss
      </button>
    </div>
  );
}
