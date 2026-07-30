// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Size, SizeMapping } from '../../types';

const SIZE_COLORS: Record<string, string> = {
  'XS': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  'S': 'bg-teal-100 text-teal-800 border-teal-300',
  'M': 'bg-blue-100 text-blue-800 border-blue-300',
  'L': 'bg-amber-100 text-amber-800 border-amber-300',
  'XL': 'bg-orange-100 text-orange-800 border-orange-300',
  'XXL': 'bg-red-100 text-red-800 border-red-300',
  'XXXL': 'bg-rose-100 text-rose-800 border-rose-300',
};

interface SizePickerProps {
  value: Size;
  sizeMapping: SizeMapping[];
  onChange: (size: Size) => void;
}

export default function SizePicker({ value, sizeMapping, onChange }: SizePickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0, above: false });
  const ref = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const handleToggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const dropdownHeight = (sizeMapping.length * 28) + (value ? 36 : 0) + 8;
      const spaceBelow = window.innerHeight - rect.bottom;
      const above = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
      setPos({
        x: rect.left,
        y: above ? rect.top : rect.bottom + 4,
        above,
      });
    }
    setOpen(!open);
  };

  const colorClass = value ? (SIZE_COLORS[value] || 'bg-gray-100 text-gray-800 border-gray-300') : '';

  const dropdown = open ? createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[100px]"
      style={{
        left: pos.x,
        top: pos.above ? undefined : pos.y,
        bottom: pos.above ? (window.innerHeight - pos.y + 4) : undefined,
      }}
    >
      {sizeMapping.map(m => (
        <button
          key={m.label}
          onClick={() => { onChange(m.label as Size); setOpen(false); }}
          className={`block w-full text-left px-3 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
            value === m.label ? 'font-semibold bg-gray-50 dark:bg-gray-800' : ''
          }`}
        >
          <span className={`inline-block w-10 text-xs font-medium px-1.5 py-0.5 rounded ${SIZE_COLORS[m.label] || 'bg-gray-100'}`}>
            {m.label}
          </span>
          <span className="ml-2 text-gray-500 dark:text-gray-400 text-xs">{m.points} pts</span>
        </button>
      ))}
      {value && (
        <>
          <div className="border-t border-gray-100 dark:border-gray-800 my-1" />
          <button
            onClick={() => { onChange(null); setOpen(false); }}
            className="block w-full text-left px-3 py-1 text-sm text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Clear size
          </button>
        </>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={handleToggle}
        className={`text-xs font-medium px-2 py-0.5 rounded border transition-colors ${
          value
            ? colorClass
            : 'bg-yellow-50 text-yellow-700 border-yellow-300 border-dashed dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-700/50'
        }`}
      >
        {value || 'Size?'}
      </button>
      {dropdown}
    </div>
  );
}

export { SIZE_COLORS };
