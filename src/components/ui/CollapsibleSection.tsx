// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

interface CollapsibleSectionProps {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export default function CollapsibleSection({ label, open, onToggle, children }: CollapsibleSectionProps) {
  return (
    <div className="mb-8">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 mb-2"
      >
        <span className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>&#9654;</span>
        {label}
      </button>
      {open && children}
    </div>
  );
}
