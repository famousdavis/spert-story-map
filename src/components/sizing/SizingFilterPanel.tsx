// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useEffect, useRef, useState } from 'react';
import type { SizingFilter } from './useSizingLayout';
import { DEFAULT_SIZING_FILTER } from './useSizingLayout';

interface ThemeInfo {
  id: string;
  name: string;
  color?: string;
}

interface ReleaseInfo {
  id: string;
  name: string;
}

interface SizingFilterPanelProps {
  themes: ThemeInfo[];
  releases: ReleaseInfo[];
  filter: SizingFilter;
  onFilterChange: (filter: SizingFilter) => void;
}

export default function SizingFilterPanel({ themes, releases, filter, onFilterChange }: SizingFilterPanelProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click — clicking anywhere outside the panel (including the
  // canvas) collapses the filter. Mirrors RibCardColorPicker / KebabMenu pattern.
  // Defer attaching so the click that opened the panel doesn't immediately close it.
  useEffect(() => {
    if (!open) return;
    function handleDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handleDown);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handleDown);
    };
  }, [open]);

  const activeCount = filter.themeIds.length + filter.releaseIds.length + (filter.hideLocked ? 1 : 0);
  const hasActiveFilter = activeCount > 0;

  const toggleTheme = (themeId: string) => {
    const next = filter.themeIds.includes(themeId)
      ? filter.themeIds.filter(id => id !== themeId)
      : [...filter.themeIds, themeId];
    onFilterChange({ ...filter, themeIds: next });
  };

  const toggleRelease = (releaseId: string) => {
    const next = filter.releaseIds.includes(releaseId)
      ? filter.releaseIds.filter(id => id !== releaseId)
      : [...filter.releaseIds, releaseId];
    onFilterChange({ ...filter, releaseIds: next });
  };

  const toggleHideLocked = () => {
    onFilterChange({ ...filter, hideLocked: !filter.hideLocked });
  };

  const clearAll = () => {
    onFilterChange(DEFAULT_SIZING_FILTER);
  };

  return (
    <div ref={rootRef} className="flex flex-col items-end gap-2">
        {/* Filter toggle button */}
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border shadow-sm transition-colors ${
            hasActiveFilter
              ? 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/40 dark:border-blue-600 dark:text-blue-300 dark:hover:bg-blue-900/60'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800'
          }`}
        >
          {/* Funnel icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filter
          {hasActiveFilter && (
            <span className="ml-0.5 bg-blue-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center dark:bg-blue-500">
              {activeCount}
            </span>
          )}
        </button>

        {/* Collapsible panel */}
        {open && (
          <div className="bg-white border border-gray-200 rounded-lg shadow-md p-3 w-64 dark:bg-gray-900 dark:border-gray-700">
            {/* Theme chips */}
            {themes.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
                  Themes
                </div>
                <div className="flex flex-wrap gap-1">
                  {themes.map(t => {
                    const isSelected = filter.themeIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggleTheme(t.id)}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          isSelected
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                        }`}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Release chips */}
            {releases.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
                  Releases
                </div>
                <div className="flex flex-wrap gap-1">
                  {releases.map(r => {
                    const isSelected = filter.releaseIds.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        onClick={() => toggleRelease(r.id)}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          isSelected
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                        }`}
                      >
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Hide completed toggle */}
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none" htmlFor="sizing-hide-locked">
                Hide completed
              </label>
              <input
                id="sizing-hide-locked"
                name="hideLocked"
                type="checkbox"
                checked={filter.hideLocked}
                onChange={toggleHideLocked}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
              />
            </div>

            {/* Clear button */}
            {hasActiveFilter && (
              <button
                onClick={clearAll}
                className="mt-2 w-full text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
    </div>
  );
}
