// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useEffect, useId } from 'react';
import Modal from '../ui/Modal';
import { Section, Field } from '../ui/Section';
import StorageSection from './StorageSection';
import { useStorage } from '../../lib/StorageProvider';
import type { UserSettings } from '../../types';

interface AppSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AppSettingsModal({ open, onClose }: AppSettingsModalProps) {
  const { driver } = useStorage();
  const [prefs, setPrefs] = useState<UserSettings>({});
  const baseId = useId();

  useEffect(() => {
    if (open && driver) driver.loadPreferences().then(setPrefs);
  }, [driver, open]);

  const updatePref = (key: string, value: unknown) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    driver.savePreferences(next);
  };

  return (
    <Modal open={open} onClose={onClose} title="Cloud Storage">
      <StorageSection onClose={onClose} />

      <Section title="Export Attribution">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Identify yourself on exported files. These fields are included in JSON exports for traceability.
        </p>
        <div className="space-y-3">
          <Field label="Name" htmlFor={`${baseId}-export-name`}>
            <input
              id={`${baseId}-export-name`}
              name="exportName"
              type="text"
              autoComplete="name"
              value={prefs.exportName || ''}
              onChange={e => updatePref('exportName', e.target.value)}
              placeholder="e.g., Jane Smith"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-400 dark:focus:border-blue-500 outline-none"
            />
          </Field>
          <Field label="Identifier" htmlFor={`${baseId}-export-id`}>
            <input
              id={`${baseId}-export-id`}
              name="exportId"
              type="text"
              value={prefs.exportId || ''}
              onChange={e => updatePref('exportId', e.target.value)}
              placeholder="e.g., student ID, email, or team name"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-400 dark:focus:border-blue-500 outline-none"
            />
          </Field>
        </div>
      </Section>

      <Section title="Notifications">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Warn me on startup when using local storage
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Shows a caution banner each time the app opens while your data is stored locally in this browser.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={!prefs?.suppressLocalStorageWarning}
            onClick={() => updatePref('suppressLocalStorageWarning', !prefs?.suppressLocalStorageWarning)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              !prefs?.suppressLocalStorageWarning
                ? 'bg-blue-600'
                : 'bg-gray-200 dark:bg-gray-600'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                !prefs?.suppressLocalStorageWarning ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </Section>
    </Modal>
  );
}
