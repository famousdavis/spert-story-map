import { useState } from 'react';
import { useAuth } from '../../lib/AuthProvider';
import { useStorage } from '../../lib/StorageProvider';
import { migrateLocalToCloud } from '../../lib/migration';
import { loadProductIndex, clearAllLocalProducts, loadPreferences, savePreferences } from '../../lib/storage';
import { exportAllProducts } from '../../lib/importExport';
import { Section } from '../ui/Section';
import ConfirmDialog from '../ui/ConfirmDialog';

export default function StorageSection() {
  const { user, firebaseAvailable, signInWithGoogle, signInWithMicrosoft, signOut } = useAuth();
  const { driver, mode, switchMode, isCloudAvailable } = useStorage();
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState(null);
  const [exporting, setExporting] = useState(false);

  // Don't render if Firebase is not configured
  if (!isCloudAvailable || !firebaseAvailable) return null;

  const localCount = mode === 'local' ? loadProductIndex().length : 0;
  const prefs = loadPreferences();
  const hasUploadedBefore = !!prefs._hasUploadedToCloud;

  const handleModeSwitch = (newMode) => {
    if (newMode === mode) return;

    if (newMode === 'local') {
      // Cloud → Local: simple mode switch, no migration
      switchMode('local');
      return;
    }

    // Local → Cloud
    if (!user) return;

    if (localCount > 0) {
      // Has local products — ask to upload
      setShowUploadConfirm(true);
    } else {
      // No local products — switch directly
      switchMode('cloud');
      if (!hasUploadedBefore) {
        savePreferences({ ...prefs, _hasUploadedToCloud: true });
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
      console.error('Migration failed:', e);
      setMigrateResult('Upload failed. Please try again.');
    } finally {
      setMigrating(false);
    }
  };

  const skipUpload = () => {
    // User chose not to upload — just switch to cloud
    setShowUploadConfirm(false);
    switchMode('cloud');
    if (!hasUploadedBefore) {
      savePreferences({ ...prefs, _hasUploadedToCloud: true });
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
      console.error('Export failed:', e);
      setMigrateResult('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleSignIn = async (provider) => {
    setAuthError(null);
    try {
      if (provider === 'google') {
        await signInWithGoogle();
      } else {
        await signInWithMicrosoft();
      }
    } catch (e) {
      console.error('Sign-in failed:', e);
      setAuthError(e.code === 'auth/popup-closed-by-user'
        ? 'Sign-in was cancelled.'
        : 'Sign-in failed. Please try again.');
    }
  };

  const handleSignOut = async () => {
    await signOut();
    if (mode === 'cloud') {
      switchMode('local');
    }
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
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Sign in with Google
            </button>
            <button
              onClick={() => handleSignIn('microsoft')}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Sign in with Microsoft
            </button>
          </div>
          {authError && (
            <p className="text-xs text-red-500 dark:text-red-400">{authError}</p>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user.displayName || 'Signed in'}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          >
            Sign out
          </button>
        </div>
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
        cancelLabel="Skip"
        onCancel={skipUpload}
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
    </Section>
  );
}
