// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The Products page's header (v0.55.0): SPERT Forecaster's
// (`src/shell/components/AppShell.tsx:121-152` at 38f1a63), the suite's header. The title's
// gradient runs between Forecaster's two light and dark SPERT blues, written here as their values:
// Story Map's theme does not define Forecaster's names for them, which as classes produce no CSS,
// and with `text-transparent` the title would be invisible. The logo (passed in by the page, which
// keeps it as it was) links home; the gear, theme toggle, About and storage pill are Story Map's,
// unchanged.

import { Link } from 'react-router-dom';
import ThemeToggle from '../ui/ThemeToggle';
import StorageStatusPill from '../ui/StorageStatusPill';
import type { ComponentProps, ReactNode } from 'react';

type ThemeMode = ComponentProps<typeof ThemeToggle>['theme'];

const GRADIENT = 'font-bold bg-gradient-to-r from-[#0099ff] to-[#0051cc] bg-clip-text text-transparent';

interface ProjectsHeaderProps {
  /** Story Map's own logo, linked home: the page renders it, unchanged. */
  logo: ReactNode;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

export default function ProjectsHeader({ logo, theme, onToggleTheme, onOpenSettings }: ProjectsHeaderProps) {
  return (
    <header className="mb-6 flex items-start justify-between">
      <div>
        <div className="flex items-center gap-3 mb-1">
          {logo}
          <h1 className="text-2xl sm:text-[1.75rem] md:text-[2.1rem] leading-[normal]">
            <span className={GRADIENT}>SPERT</span>
            <span className="text-gray-400 dark:text-gray-500 font-normal text-base sm:text-lg align-top">®</span>
            <span className={GRADIENT}>{' Story Map'}</span>
          </h1>
        </div>
        <p className="text-sm leading-[normal] text-gray-500 dark:text-gray-400 italic">
          Plan and track agile product releases
        </p>
      </div>
      <div className="flex items-center gap-3 mt-1">
        <button
          onClick={onOpenSettings}
          title="App Settings"
          className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        </button>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <Link to="/about" className="text-sm text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors">
          About
        </Link>
        <StorageStatusPill onClick={onOpenSettings} />
      </div>
    </header>
  );
}
