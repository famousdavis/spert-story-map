import { useState, useEffect } from 'react';
import { NavLink, useParams, Outlet } from 'react-router-dom';
import { useProduct } from '../../hooks/useProduct';
import { useStorage } from '../../lib/StorageProvider';
import { formatRelativeTime } from '../../lib/formatDate';
import { useDarkMode } from '../../hooks/useDarkMode';
import ThemeToggle from '../ui/ThemeToggle';
import AppSettingsModal from '../settings/AppSettingsModal';
import { Footer } from '../../pages/ChangelogView';

const tabs = [
  { path: 'structure', label: 'Structure', icon: '◫' },
  { path: 'releases', label: 'Releases', icon: '▦' },
  { path: 'storymap', label: 'Map', icon: '▤' },
  { path: 'sizing', label: 'Sizing', icon: '⊞' },
  { path: 'progress', label: 'Progress', icon: '◔' },
  { path: 'insights', label: 'Insights', icon: '◨' },
  { path: 'settings', label: 'Settings', icon: '⚙' },
];

export default function ProductLayout() {
  const { productId } = useParams();
  const { product, loading, lastSaved, updateProduct, undo, redo } = useProduct(productId);
  const { driver } = useStorage();
  const [saveError, setSaveError] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { theme, toggleTheme } = useDarkMode();

  useEffect(() => {
    if (!driver) return;
    driver.onSaveError(() => setSaveError(true));
    return () => driver.onSaveError(null);
  }, [driver]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-gray-400 dark:text-gray-500">Loading...</div>;
  }

  if (!product) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">Project not found</p>
          <a href="/" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium">Back to projects</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <a href="/" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-sm">
                ← Projects
              </a>
              <div className="h-5 w-px bg-gray-200 dark:bg-gray-700" />
              <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate max-w-xs">
                {product.name}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              {lastSaved && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  Saved {formatRelativeTime(lastSaved)}
                </span>
              )}
              <button
                onClick={() => setShowSettings(true)}
                title="App Settings"
                className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
              </button>
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>
          </div>
          {/* Tab navigation */}
          <nav className="flex gap-1 -mb-px">
            {tabs.map(tab => (
              <NavLink
                key={tab.path}
                to={`/product/${productId}/${tab.path}`}
                className={({ isActive }) =>
                  `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600'
                  }`
                }
              >
                <span className="mr-1.5">{tab.icon}</span>
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* Save error banner */}
      {saveError && (
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-700/50 px-6 py-2 text-center">
          <p className="text-xs text-red-700 dark:text-red-300">
            Storage full — your latest changes may not be saved. Export your data from Settings to avoid data loss.
          </p>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 max-w-[1600px] mx-auto w-full px-6 py-6">
        <Outlet context={{ product, updateProduct, undo, redo }} />
      </main>

      <div className="max-w-[1600px] mx-auto w-full px-6">
        <Footer />
      </div>

      <AppSettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
