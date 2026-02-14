import { NavLink, useParams, Outlet } from 'react-router-dom';
import { useProduct } from '../../hooks/useProduct';
import { Footer } from '../../pages/ChangelogView';

const tabs = [
  { path: 'structure', label: 'Structure', icon: '◫' },
  { path: 'releases', label: 'Releases', icon: '▦' },
  { path: 'storymap', label: 'Map', icon: '▤' },
  { path: 'progress', label: 'Progress', icon: '◔' },
  { path: 'insights', label: 'Insights', icon: '◨' },
  { path: 'settings', label: 'Settings', icon: '⚙' },
];

export default function ProductLayout() {
  const { productId } = useParams();
  const { product, loading, lastSaved, updateProduct, undo, redo } = useProduct(productId);

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>;
  }

  if (!product) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Project not found</p>
          <a href="/" className="text-blue-600 hover:text-blue-700 text-sm font-medium">Back to projects</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <a href="/" className="text-gray-400 hover:text-gray-600 text-sm">
                ← Projects
              </a>
              <div className="h-5 w-px bg-gray-200" />
              <h1 className="text-base font-semibold text-gray-900 truncate max-w-xs">
                {product.name}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              {lastSaved && (
                <span className="text-xs text-gray-400">
                  Saved {formatRelativeTime(lastSaved)}
                </span>
              )}
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
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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

      {/* Content */}
      <main className="flex-1 max-w-[1600px] mx-auto w-full px-6 py-6">
        <Outlet context={{ product, updateProduct, undo, redo }} />
      </main>

      <div className="max-w-[1600px] mx-auto w-full px-6">
        <Footer />
      </div>
    </div>
  );
}

function formatRelativeTime(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return date.toLocaleTimeString();
}
