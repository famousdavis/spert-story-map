// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthProvider';
import { useStorage } from '../../lib/StorageProvider';
import { migrateLocalToCloud, testCloudConnection, type UploadOutcome } from '../../lib/migration';
import { loadProductIndex, removeLocalProducts } from '../../lib/storage';
import { uploadMessage, clearOfferMessage, UPLOAD_STOPPED, STATUS_CLASS, type StorageMessage } from './uploadMessage';
import { exportAllProducts } from '../../lib/importExport';
import { signOutCleanup } from '../../lib/signOutCleanup';
import { Section } from '../ui/Section';
import ConfirmDialog from '../ui/ConfirmDialog';
import TosConsentModal from './TosConsentModal';
import { useSignInWithTosGate } from '../../hooks/useSignInWithTosGate';
import { normalizeDisplayName } from '../../lib/userDisplay';
import { GoogleIcon, MicrosoftIcon } from '../auth/AuthProviderLogos';
import type { StorageMode } from '../../types';

interface StorageSectionProps {
  onClose?: () => void;
}

export default function StorageSection({ onClose }: StorageSectionProps = {}) {
  const { user, firebaseAvailable } = useAuth();
  const { driver, mode, switchMode, isCloudAvailable } = useStorage();
  const navigate = useNavigate();
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<StorageMessage | null>(null);
  const [lastUpload, setLastUpload] = useState<UploadOutcome | null>(null);
  const [exporting, setExporting] = useState(false);
  const tos = useSignInWithTosGate();

  // Don't render if Firebase is not configured
  if (!isCloudAvailable || !firebaseAvailable) return null;

  // Explicit 'local' override — the local-projects count for the migration
  // banner must reflect the anonymous-session cache, not the signed-in
  // user's per-uid local cache (which is empty for fresh sign-ins).
  const localCount = mode === 'local' ? loadProductIndex('local').length : 0;

  const handleModeSwitch = async (newMode: StorageMode) => {
    if (newMode === mode) return;

    if (newMode === 'local') {
      // Cloud → Local: simple mode switch, no migration.
      // Navigate to / so that any currently-open cloud product page
      // does not become a "Product not found" dead end after the
      // driver swaps to local.
      switchMode('local');
      navigate('/');
      return;
    }

    // Local → Cloud
    if (!user) return;

    if (localCount > 0) {
      // Has local products — ask to upload
      setShowUploadConfirm(true);
    } else {
      // No local products — verify cloud is reachable before switching
      setMigrating(true);
      setMigrateResult(null);
      try {
        const reachable = await testCloudConnection(user.uid);
        if (!reachable) {
          setMigrateResult({ status: 'error', text: 'Could not connect to cloud storage. Please check your internet connection and try again.' });
          return;
        }
        switchMode('cloud');
      } finally {
        setMigrating(false);
      }
    }
  };

  const confirmUpload = async () => {
    // Unreachable — the upload flow is only reachable while signed in — but the
    // migration needs a uid, and returning is honest where the previous code
    // would have thrown on `user.uid`.
    if (!user) return;
    setShowUploadConfirm(false);
    setMigrating(true);
    setMigrateResult(null);

    try {
      const result = await migrateLocalToCloud(user.uid);
      switchMode('cloud');
      setMigrateResult(uploadMessage(result));
      // R72: offered only when something was uploaded, and it removes only what was.
      setLastUpload(result);
      if (clearOfferMessage(result) !== null) setShowCleanupConfirm(true);
    } catch (e) {
      console.error('Migration failed:', e instanceof Error ? e.message : 'Unknown error');
      setMigrateResult(UPLOAD_STOPPED);
    } finally {
      setMigrating(false);
    }
  };

  const confirmCleanup = () => {
    // Explicit 'local' override — the upload read the anonymous-session store, not the user's
    // per-uid local namespace (which is unrelated and should not be touched). Only the products
    // this upload sent are removed (v0.55.15, R72); skipped and unreadable ones stay.
    removeLocalProducts(lastUpload?.uploadedIds ?? [], 'local');
    setShowCleanupConfirm(false);
    setMigrateResult(prev => prev && { ...prev, text: `${prev.text} Copies of the uploaded products were cleared from this browser.` });
  };

  const handleDownloadAll = async () => {
    if (!driver) return;
    setExporting(true);
    try {
      const result = await exportAllProducts(driver, user?.uid);
      setMigrateResult({ status: 'ok', text: `Downloaded ${result.exported} product${result.exported !== 1 ? 's' : ''} as JSON.` });
    } catch (e) {
      console.error('Export failed:', e instanceof Error ? e.message : 'Unknown error');
      setMigrateResult({ status: 'error', text: 'Export failed. Please try again.' });
    } finally {
      setExporting(false);
    }
  };

  const handleSignOut = async () => {
    await signOutCleanup(switchMode);
    onClose?.();
  };

  return (
    <Section title="Storage">
      {/* Mode toggle */}
      <div className="flex gap-6 mb-4">
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            type="radio"
            name="storage-mode"
            value="local"
            checked={mode === 'local'}
            onChange={() => handleModeSwitch('local')}
            disabled={migrating}
            className="text-blue-600"
          />
          Local (browser only)
        </label>
        <label className={`flex items-center gap-2 text-sm cursor-pointer ${!user ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
          <input
            type="radio"
            name="storage-mode"
            value="cloud"
            checked={mode === 'cloud'}
            onChange={() => handleModeSwitch('cloud')}
            disabled={!user || migrating}
            className="text-blue-600"
          />
          Cloud (sync across devices)
        </label>
      </div>

      {/* Migrating indicator */}
      {migrating && (
        <p className="text-sm text-blue-600 dark:text-blue-400 mb-3">Uploading data...</p>
      )}

      {/* Migration result */}
      {migrateResult && !migrating && (
        <p className={`text-xs mb-3 ${STATUS_CLASS[migrateResult.status]}`}>
          {migrateResult.text}
        </p>
      )}

      {/* Auth section */}
      {!user ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Sign in to enable cloud storage and sharing.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => tos.signIn('google')}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50"
            >
              <GoogleIcon />
              Sign in with Google
            </button>
            <button
              onClick={() => tos.signIn('microsoft')}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50"
            >
              <MicrosoftIcon />
              Sign in with Microsoft
            </button>
          </div>
          {/* Microsoft is restricted to work/school accounts at the app
              registration, so a personal account is refused by Microsoft
              before a password is entered. Saying so spares a dead end. */}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Microsoft sign-in requires a work or school account. For a personal
            account, use Google.
          </p>
          {tos.authError && (
            <p className="text-xs text-red-500 dark:text-red-400">{tos.authError}</p>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {normalizeDisplayName(user.displayName) || user.email?.split('@')[0] || 'Signed in'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            >
              Sign out
            </button>
          </div>
          {mode === 'local' && (
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Keep using local storage
            </button>
          )}
        </>
      )}

      {/* Download all projects (cloud mode only) */}
      {mode === 'cloud' && user && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleDownloadAll}
            disabled={exporting}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {exporting ? 'Downloading...' : 'Download All Products as JSON'}
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Export all your cloud products as individual JSON files.
          </p>
        </div>
      )}

      {/* Upload confirmation */}
      <ConfirmDialog
        open={showUploadConfirm}
        onClose={() => setShowUploadConfirm(false)}
        onConfirm={confirmUpload}
        title="Upload Local Products"
        message={`You have ${localCount} local product${localCount !== 1 ? 's' : ''}. Upload them to cloud?`}
        confirmLabel="Upload"
        danger={false}
      />

      {/* Cleanup confirmation */}
      <ConfirmDialog
        open={showCleanupConfirm}
        onClose={() => setShowCleanupConfirm(false)}
        onConfirm={confirmCleanup}
        title="Clear Local Data"
        message={lastUpload ? clearOfferMessage(lastUpload) ?? '' : ''}
        confirmLabel="Clear Local Data"
        danger={true}
      />

      {/* ToS consent modal — key forces remount to reset checkbox */}
      {tos.showTosConsent && (
        <TosConsentModal
          open
          onClose={tos.onTosCancel}
          onAccept={tos.onTosAccepted}
        />
      )}
    </Section>
  );
}
