// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface KebabMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export interface KebabMenuProps {
  items: KebabMenuItem[];
  ariaLabel?: string;
  onOpenChange?: (open: boolean) => void;
  align?: 'left' | 'right';
}

interface MenuRect {
  top: number;
  left: number;
}

const MENU_WIDTH = 160;
const MENU_OFFSET_Y = 4;

export default function KebabMenu({
  items,
  ariaLabel = 'Open menu',
  onOpenChange,
  align = 'right',
}: KebabMenuProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<MenuRect | null>(null);
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const setOpenState = useCallback((next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  }, [onOpenChange]);

  const computeRect = useCallback((): MenuRect | null => {
    const trigger = triggerRef.current;
    if (!trigger) return null;
    const tr = trigger.getBoundingClientRect();
    const top = tr.bottom + MENU_OFFSET_Y;
    const left = align === 'right' ? tr.right - MENU_WIDTH : tr.left;
    return { top, left };
  }, [align]);

  const openMenu = useCallback(() => {
    const r = computeRect();
    if (!r) return;
    setRect(r);
    setOpenState(true);
    // Focus first non-disabled item after the menu mounts
    const firstEnabled = items.findIndex(i => !i.disabled);
    setFocusedIdx(firstEnabled);
  }, [computeRect, setOpenState, items]);

  const closeMenu = useCallback((returnFocusToTrigger = true) => {
    setOpenState(false);
    setFocusedIdx(-1);
    if (returnFocusToTrigger) triggerRef.current?.focus();
  }, [setOpenState]);

  // Outside click + scroll/resize close
  useEffect(() => {
    if (!open) return;
    const handleDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      closeMenu(false);
    };
    const handleScroll = () => closeMenu(false);
    const handleResize = () => closeMenu(false);
    document.addEventListener('mousedown', handleDocClick, true);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handleDocClick, true);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, closeMenu]);

  // Focus the menu item indicated by focusedIdx
  useEffect(() => {
    if (!open || focusedIdx < 0) return;
    itemRefs.current[focusedIdx]?.focus();
  }, [open, focusedIdx]);

  const moveFocus = useCallback((delta: number) => {
    if (items.length === 0) return;
    let idx = focusedIdx;
    for (let i = 0; i < items.length; i++) {
      idx = (idx + delta + items.length) % items.length;
      if (!items[idx]?.disabled) {
        setFocusedIdx(idx);
        return;
      }
    }
  }, [items, focusedIdx]);

  const handleTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenu();
    }
  };

  const handleMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(-1);
    } else if (e.key === 'Tab') {
      // Tab closes the menu; let the browser advance focus naturally
      closeMenu(false);
    }
  };

  const handleItemClick = (item: KebabMenuItem) => {
    if (item.disabled) return;
    item.onClick();
    closeMenu(false);
  };

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="true"
      aria-expanded={open}
      aria-label={ariaLabel}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (open) closeMenu(true);
        else openMenu();
      }}
      onKeyDown={handleTriggerKey}
      className="inline-flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-200 leading-none text-base"
    >
      {'⋮'}
    </button>
  );

  const menu = open && rect ? createPortal(
    <div
      ref={menuRef}
      role="menu"
      onKeyDown={handleMenuKey}
      style={{ position: 'fixed', top: rect.top, left: rect.left, width: MENU_WIDTH, zIndex: 60 }}
      className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1"
    >
      {items.map((item, i) => {
        const baseClass = 'w-full text-left px-3 py-1.5 text-sm focus:outline-none focus:bg-gray-100 dark:focus:bg-gray-800';
        const enabledClass = item.danger
          ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
          : 'text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800';
        const disabledClass = 'text-gray-400 dark:text-gray-600 cursor-not-allowed';
        return (
          <button
            key={`${item.label}-${i}`}
            ref={(el) => { itemRefs.current[i] = el; }}
            type="button"
            role="menuitem"
            aria-disabled={item.disabled || undefined}
            title={item.disabled ? item.disabledReason : undefined}
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
            className={`${baseClass} ${item.disabled ? disabledClass : enabledClass}`}
            data-danger={item.danger ? 'true' : undefined}
          >
            {item.label}
          </button>
        );
      })}
    </div>,
    document.body,
  ) : null;

  return (
    <>
      {trigger}
      {menu}
    </>
  );
}
