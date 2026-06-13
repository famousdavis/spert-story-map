// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState } from 'react';
import Modal from '../ui/Modal';
import { AI_PRIVACY_URL } from '../../lib/aiConstants';

interface ConsentModalProps {
  open: boolean;
  onClose: () => void;
  /** Calls startSession; resolves true on success. Parent opens the panel. */
  onConnect: (consentRead: boolean) => Promise<boolean>;
  initialConsentRead?: boolean;
}

export default function ConsentModal({
  open, onClose, onConnect, initialConsentRead = false,
}: ConsentModalProps) {
  const [consentRead, setConsentRead] = useState(initialConsentRead);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    const ok = await onConnect(consentRead);
    setConnecting(false);
    if (!ok) setError('Could not start the AI session. Check your connection and try again.');
  };

  return (
    <Modal open={open} onClose={onClose} title="Connect an AI assistant">
      <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
        <p>
          Connecting lets your AI chatbot build a story map in this project. You stay
          in control: the AI asks what to build before doing anything, and you choose
          what it can access.
        </p>
        <div className="space-y-3">
          <label htmlFor="ai-consent-write" className="flex items-start gap-3">
            <input
              id="ai-consent-write" name="ai-consent-write" type="checkbox"
              checked disabled autoComplete="off"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            <span>
              <span className="font-medium text-gray-900 dark:text-gray-100">Write Mode</span>
              {' '}(required)
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                The AI can create themes, backbones, and rib items in this project.
              </span>
            </span>
          </label>
          <label htmlFor="ai-consent-read" className="flex items-start gap-3">
            <input
              id="ai-consent-read" name="ai-consent-read" type="checkbox"
              checked={consentRead} autoComplete="off"
              onChange={e => setConsentRead(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            <span>
              <span className="font-medium text-gray-900 dark:text-gray-100">Read Mode</span>
              {' '}(optional)
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                Let the AI read your current story map so it can suggest changes in context.
              </span>
            </span>
          </label>
        </div>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex items-center justify-between pt-2">
          <a
            href={AI_PRIVACY_URL} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            AI privacy notice
          </a>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-md text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleConnect} disabled={connecting}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
