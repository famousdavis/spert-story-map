import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import { Section, Field } from '../ui/Section';
import StorageSection from './StorageSection';
import { useStorage } from '../../lib/StorageProvider';

export default function AppSettingsModal({ open, onClose }) {
  const { driver } = useStorage();
  const [prefs, setPrefs] = useState({});

  useEffect(() => {
    if (open && driver) driver.loadPreferences().then(setPrefs);
  }, [driver, open]);

  const updatePref = (key, value) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    driver.savePreferences(next);
  };

  return (
    <Modal open={open} onClose={onClose} title="App Settings">
      <StorageSection />

      <Section title="Export Attribution">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Identify yourself on exported files. These fields are included in JSON exports for traceability.
        </p>
        <div className="space-y-3">
          <Field label="Name">
            <input
              type="text"
              value={prefs.exportName || ''}
              onChange={e => updatePref('exportName', e.target.value)}
              placeholder="e.g., Jane Smith"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-400 dark:focus:border-blue-500 outline-none"
            />
          </Field>
          <Field label="Identifier">
            <input
              type="text"
              value={prefs.exportId || ''}
              onChange={e => updatePref('exportId', e.target.value)}
              placeholder="e.g., student ID, email, or team name"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-400 dark:focus:border-blue-500 outline-none"
            />
          </Field>
        </div>
      </Section>
    </Modal>
  );
}
