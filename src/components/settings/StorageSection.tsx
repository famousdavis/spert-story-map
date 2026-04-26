// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthProvider';
import { useStorage } from '../../lib/StorageProvider';
import { migrateLocalToCloud, testCloudConnection } from '../../lib/migration';
import { loadProductIndex, clearAllLocalProducts, loadPreferences, savePreferences } from '../../lib/storage';
import { exportAllProducts } from '../../lib/importExport';
import { signOutCleanup } from '../../lib/signOutCleanup';
import { Section } from '../ui/Section';
import ConfirmDialog from '../ui/ConfirmDialog';
import TosConsentModal from './TosConsentModal';
import { isTosAcceptedLocally, cacheTosAcceptance } from '../../lib/tosHelpers';
import { normalizeDisplayName } from '../../lib/userDisplay';
import type { StorageMode } from '../../types';

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

type AuthProvider = 'google' | 'microsoft';

interface StorageSectionProps {
  onClose?: () => void;
}

export default function StorageSection({ onClose }: StorageSectionProps = {}) {
  const { user, firebaseAvailable, signInWithGoogle, signInWithMicrosoft } = useAuth();
  const { driver, mode, switchMode, isCloudAvailable } = useStorage();
  const navigate = useNavigate();
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showTosConsent, setShowTosConsent] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<AuthProvider | null>(null);

  // Don't render if Firebase is not configured
  if (!isCloudAvailable || !firebaseAvailable) return null;

  const localCount = mode === 'local' ? loadProductIndex().length : 0;
  const prefs = loadPreferences();
  const hasUploadedBefore = !!prefs._hasUploadedToCloud;

  const handleModeSwitch = async (newMode: StorageMode) => {
    if (newMode === mode) return;

    if (newMode === 'local') {
      // Cloud → Local: simple mode switch, no migration.
      // Navigate to / so that any currently-open cloud product page
      // does not become a "Project not found" dead end after the
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
          setMigrateResult('Could not connect to cloud storage. Please check your internet connection and try again.');
          return;
        }
        switchMode('cloud');
        if (!hasUploadedBefore) {
          savePreferences({ ...prefs, _hasUploadedToCloud: true });
        }
      } finally {
        setMigrating(false);
      }
    }
  };

  const confirmUpload = async () => {
    setShowUploadConfirm(false);
    setMigrating(true);
    setMigrateResult(null);

    try {
      const result = await migrateLocalToCloud(user.uid);
      switchMode('cloud');
      savePreferences({ ...loadPreferences(), _hasUploadedToCloud: true });

      const msg = `Uploaded ${result.uploaded} project${result.uploaded !== 1 ? 's' : ''} to cloud${result.skipped ? ` (${result.skipped} already in cloud)` : ''}.`;
      setMigrateResult(msg);

      // Offer to clear local data after successful upload
      if (result.uploaded > 0 || result.skipped > 0) {
        setShowCleanupConfirm(true);
      }
    } catch (e) {
      console.error('Migration failed:', e instanceof Error ? e.message : 'Unknown error');
      setMigrateResult('Upload failed. Please try again.');
    } finally {
      setMigrating(false);
    }
  };

  const confirmCleanup = () => {
    clearAllLocalProducts();
    setShowCleanupConfirm(false);
    setMigrateResult(prev => prev + ' Local data cleared.');
  };

  const handleDownloadAll = async () => {
    setExporting(true);
    try {
      const result = await exportAllProducts(driver, user?.uid);
      setMigrateResult(`Downloaded ${result.exported} project${result.exported !== 1 ? 's' : ''} as JSON.`);
    } catch (e) {
      console.error('Export failed:', e instanceof Error ? e.message : 'Unknown error');
      setMigrateResult('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleSignIn = (provider: AuthProvider) => {
    setAuthError(null);
    if (!isTosAcceptedLocally()) {
      setPendingProvider(provider);
      setShowTosConsent(true);
      return;
    }
    executeSignIn(provider);
  };

  const executeSignIn = async (provider: AuthProvider) => {
    try {
      if (provider === 'google') {
        await signInWithGoogle();
      } else {
        await signInWithMicrosoft();
      }
    } catch (e) {
      console.error('Sign-in failed:', e instanceof Error ? e.message : 'Unknown error');
      const code = (e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string')
        ? (e as { code: string }).code
        : '';
      if (code === 'auth/popup-blocked') {
        setAuthError('Your browser blocked the sign-in popup. Please allow popups for this site and try again.');
      } else if (code === 'auth/cancelled-popup-request') {
        setAuthError('Your browser blocked the sign-in popup. Please allow popups for this site and try again.');
      } else if (code === 'auth/popup-closed-by-user') {
        // User intentionally dismissed the popup — stay silent.
        setAuthError(null);
        return;
      } else {
        setAuthError('Sign-in failed. Please try again.');
      }
    }
  };

  const handleTosAccepted = () => {
    setShowTosConsent(false);
    cacheTosAcceptance();
    if (pendingProvider) {
      executeSignIn(pendingProvider);
      setPendingProvider(null);
    }
  };

  const handleSignOut = async () => {
    await signOutCleanup(driver, switchMode);
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
        <p className={`text-xs mb-3 ${migrateResult.includes('failed') ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
          {migrateResult}
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
              onClick={() => handleSignIn('google')}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50"
            >
              <GoogleIcon />
              Sign in with Google
            </button>
            <button
              onClick={() => handleSignIn('microsoft')}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50"
            >
              <MicrosoftIcon />
              Sign in with Microsoft
            </button>
          </div>
          {authError && (
            <p className="text-xs text-red-500 dark:text-red-400">{authError}</p>
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
            {exporting ? 'Downloading...' : 'Download All Projects as JSON'}
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Export all your cloud projects as individual JSON files.
          </p>
        </div>
      )}

      {/* Upload confirmation */}
      <ConfirmDialog
        open={showUploadConfirm}
        onClose={() => setShowUploadConfirm(false)}
        onConfirm={confirmUpload}
        title="Upload Local Projects"
        message={`You have ${localCount} local project${localCount !== 1 ? 's' : ''}. Upload them to cloud?${hasUploadedBefore ? ' Projects already in cloud will be skipped.' : ''}`}
        confirmLabel="Upload"
        danger={false}
      />

      {/* Cleanup confirmation */}
      <ConfirmDialog
        open={showCleanupConfirm}
        onClose={() => setShowCleanupConfirm(false)}
        onConfirm={confirmCleanup}
        title="Clear Local Data"
        message="Your projects are now in the cloud. Clear local copies to prevent duplicates on future sign-ins?"
        confirmLabel="Clear Local Data"
        danger={true}
      />

      {/* ToS consent modal — key forces remount to reset checkbox */}
      {showTosConsent && (
        <TosConsentModal
          open
          onClose={() => { setShowTosConsent(false); setPendingProvider(null); }}
          onAccept={handleTosAccepted}
        />
      )}
    </Section>
  );
}
