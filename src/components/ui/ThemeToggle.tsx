// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

type ThemeMode = 'light' | 'dark' | 'system';

const LABELS: Record<ThemeMode, string> = { light: 'Light mode', dark: 'Dark mode', system: 'System default' };

interface ThemeToggleProps {
  theme: ThemeMode;
  onToggle: () => void;
}

/**
 * The frame's theme button (FRAME26, contract §3, v0.57.0): `.sf-theme`, 32 px, just left of the account chip. Its
 * icons draw in `currentColor`: the frame's muted text at rest, its text colour on hover. It cycles Light → Dark →
 * System, the contract's System → Light → Dark cycle, and keeps its names and the stored `spert-theme` setting.
 */
export default function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="sf-theme"
      data-sf="theme"
      aria-label={LABELS[theme]}
      title={LABELS[theme]}
    >
      {theme === 'light' && (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )}
      {theme === 'dark' && (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
      {theme === 'system' && (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
        </svg>
      )}
    </button>
  );
}
