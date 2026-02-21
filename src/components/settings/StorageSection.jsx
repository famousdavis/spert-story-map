import { useState } from 'react';
import { useAuth } from '../../lib/AuthProvider';
import { useStorage } from '../../lib/StorageProvider';
import { migrateLocalToCloud, migrateCloudToLocal } from '../../lib/migration';
import { loadProductIndex } from '../../lib/storage';
import { Section } from '../ui/Section';
import ConfirmDialog from '../ui/ConfirmDialog';

export default function StorageSection() {
  const { user, firebaseAvailable, signInWithGoogle, signInWithMicrosoft, signOut } = useAuth();
  const { mode, switchMode, isCloudAvailable } = useStorage();
  const [showMigrateConfirm, setShowMigrateConfirm] = useState(false);
  const [pendingMode, setPendingMode] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState(null);

  // Don't render if Firebase is not configured
  if (!isCloudAvailable || !firebaseAvailable) return null;

  const handleModeSwitch = (newMode) => {
    if (newMode === mode) return;
    if (newMode === 'cloud' && !user) return;
    setPendingMode(newMode);
    setShowMigrateConfirm(true);
  };

  const confirmSwitch = async () => {
    if (!pendingMode) return;
    setShowMigrateConfirm(false);
    setMigrating(true);
    setMigrateResult(null);

    try {
      if (pendingMode === 'cloud') {
        const result = await migrateLocalToCloud(user.uid);
        switchMode('cloud');
        setMigrateResult(`Uploaded ${result.uploaded} project${result.uploaded !== 1 ? 's' : ''} to cloud${result.skipped ? ` (${result.skipped} skipped)` : ''}.`);
      } else {
        const result = await migrateCloudToLocal(user.uid);
        switchMode('local');
        await signOut();
        setMigrateResult(`Downloaded ${result.ownedCount} project${result.ownedCount !== 1 ? 's' : ''}.${result.sharedCount ? ` ${result.sharedCount} shared project${result.sharedCount !== 1 ? 's' : ''} remain in cloud.` : ''}`);
      }
    } catch (e) {
      console.error('Migration failed:', e);
      setMigrateResult('Migration failed. Please try again.');
    } finally {
      setMigrating(false);
      setPendingMode(null);
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

  const localCount = mode === 'local' ? loadProductIndex().length : 0;

  const migrateMessage = pendingMode === 'cloud'
    ? `Upload ${localCount} local project${localCount !== 1 ? 's' : ''} to cloud? Your local data will remain as a backup.`
    : 'Download your owned cloud projects to this browser? Shared projects will only be accessible in Cloud mode.';

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
        <p className="text-sm text-blue-600 dark:text-blue-400 mb-3">Migrating data...</p>
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

      {/* Migration confirmation */}
      <ConfirmDialog
        open={showMigrateConfirm}
        onClose={() => { setShowMigrateConfirm(false); setPendingMode(null); }}
        onConfirm={confirmSwitch}
        title={pendingMode === 'cloud' ? 'Switch to Cloud Storage' : 'Switch to Local Storage'}
        message={migrateMessage}
        confirmLabel={pendingMode === 'cloud' ? 'Upload' : 'Download'}
        danger={false}
      />
    </Section>
  );
}
