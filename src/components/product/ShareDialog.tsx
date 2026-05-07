// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import Modal from '../ui/Modal';
import ProjectSharingPanel from '../settings/ProjectSharingPanel';

interface ShareDialogProps {
  productId: string;
  productName: string;
  onClose: () => void;
}

/**
 * Homepage Share modal. ProjectSharingPanel handles all sharing logic and
 * gates rendering on cloud mode + ownership; the modal body is empty for
 * non-owners (defense in depth — the icon button is also gated upstream).
 */
export default function ShareDialog({ productId, productName, onClose }: ShareDialogProps) {
  return (
    <Modal open onClose={onClose} title="Share Project" wide>
      <p className="text-sm text-gray-500 dark:text-gray-400 -mt-1 mb-5 truncate">
        {productName}
      </p>
      <ProjectSharingPanel productId={productId} />
    </Modal>
  );
}
