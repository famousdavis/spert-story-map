// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState } from 'react';
import Modal from '../ui/Modal';
import { TOS_URL, PRIVACY_POLICY_URL } from '../../lib/tosConstants';

interface TosConsentModalProps {
  open: boolean;
  onClose: () => void;
  onAccept: () => void;
}

export default function TosConsentModal({ open, onClose, onAccept }: TosConsentModalProps) {
  const [checked, setChecked] = useState(false);

  return (
    <Modal open={open} onClose={onClose} title="Cloud Storage Terms">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          Cloud Storage stores your agile planning data (estimates, story points,
          sprint metadata) in Firebase/Firestore on Google Cloud. Use is governed
          by the Statistical PERT® Terms of Service and Privacy Policy.
        </p>

        <div className="flex gap-4 text-sm">
          <a
            href={TOS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
          >
            Terms of Service
          </a>
          <a
            href={PRIVACY_POLICY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
          >
            Privacy Policy
          </a>
        </div>

        <label className="flex items-start gap-3 cursor-pointer pt-2">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 text-blue-600 rounded"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            I have read and agree to the Terms of Service and Privacy Policy.
          </span>
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onAccept}
            disabled={!checked}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Enable Cloud Storage
          </button>
        </div>
      </div>
    </Modal>
  );
}
