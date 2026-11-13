// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The Products page's own dialog shell (v0.55.0): the New Product / Edit Product dialog and the
// Delete confirmation. Its behaviour is SPERT Forecaster's `ProjectDialog.tsx` at 38f1a63, which is
// GanttApp's:
// - rendered into document.body; while it is open every other child of body is `inert`, so the page
//   behind can be neither reached nor read, and only what this shell made inert is restored;
// - focus opens on the control `initialFocus` names; Tab and Shift+Tab wrap at its ends, and bring
//   focus back if it has left;
// - Escape and, where the dialog saves, Ctrl+S / Cmd+S are taken in ONE document keydown listener
//   in the CAPTURE phase, with preventDefault and stopPropagation, so no other listener on the page
//   sees them (the import preview's own Escape listener would otherwise discard a waiting import),
//   and Cmd+S never opens the browser's Save dialog, even when there is nothing to save.
//
// ⚠️ Focus returns in the close cleanup, AFTER `inert` is removed. Focusing from a submit or
// cancel handler is a silent no-op in a browser: the page is still inert then. jsdom does not
// enforce `inert`, so a test there passes either way; the release's browser check covers it.
//
// The shared `components/ui/Modal.tsx` is not used here and does not change: Settings and Share,
// opened from the same page, keep it, with its × and its close on a backdrop click.

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { OVERLAY } from './dashboard-styles';

const FOCUSABLE = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])';

/** Make every other child of body inert; returns the undo, which restores only what it changed. */
function inertOthers(keep: HTMLElement): () => void {
  const changed = Array.from(document.body.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el !== keep && !el.hasAttribute('inert'),
  );
  changed.forEach(el => el.setAttribute('inert', ''));
  return () => changed.forEach(el => el.removeAttribute('inert'));
}

/** Tab and Shift+Tab wrap at the dialog's ends; from outside it, they bring focus back in. */
function wrapTab(e: KeyboardEvent, root: HTMLElement) {
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;
  const active = document.activeElement;
  const inside = active instanceof HTMLElement && root.contains(active);
  if (e.shiftKey && (active === first || !inside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !inside)) {
    e.preventDefault();
    first.focus();
  }
}

interface DialogShellProps {
  role: 'dialog' | 'alertdialog';
  title: string;
  titleClassName: string;
  className: string;
  /** The element that describes the dialog (the confirmation's message). */
  describedBy?: string;
  /** Where focus opens; it is selected when it is a text field and `selectInitial` is set. */
  initialFocus: (root: HTMLElement) => HTMLElement | null;
  selectInitial?: boolean;
  onEscape: () => void;
  /** Ctrl+S / Cmd+S. The key is consumed whether or not this saves anything. */
  onSave?: () => void;
  /** A press and release on the backdrop. Absent: the backdrop does nothing. */
  onBackdrop?: () => void;
  /** Where focus goes once the dialog has closed; null for nowhere. Read at close time. */
  returnFocusTo: () => HTMLElement | null;
  children: ReactNode;
}

export default function DialogShell({
  role, title, titleClassName, className, describedBy, initialFocus, selectInitial = false,
  onEscape, onSave, onBackdrop, returnFocusTo, children,
}: DialogShellProps) {
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const pressedOnOverlay = useRef(false);

  // The latest callbacks, read by the listener and the cleanup when they run.
  const latest = useRef({ onEscape, onSave, returnFocusTo, initialFocus, selectInitial });
  useEffect(() => {
    latest.current = { onEscape, onSave, returnFocusTo, initialFocus, selectInitial };
  });

  // Open: the page inert, focus in. Close: inert removed, THEN focus back. Once per mount.
  useEffect(() => {
    const overlay = overlayRef.current;
    const root = dialogRef.current;
    const undoInert = overlay ? inertOthers(overlay) : () => {};
    const first = root ? latest.current.initialFocus(root) : null;
    first?.focus();
    if (latest.current.selectInitial && first instanceof HTMLInputElement && first.type === 'text') first.select();
    return () => {
      undoInert();
      latest.current.returnFocusTo()?.focus();
    };
  }, []);

  // Capture phase, registered once: this dialog's keys never reach a listener behind it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = dialogRef.current;
      if (!root) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        latest.current.onEscape();
        return;
      }
      const save = latest.current.onSave;
      if (save && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
        save();
        return;
      }
      if (e.key === 'Tab') wrapTab(e, root);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  return createPortal(
    <div
      ref={overlayRef}
      className={OVERLAY}
      // Only a press AND release on the backdrop itself counts: a text selection or a resize that
      // ends outside the dialog must not close it (the shared Modal's pattern #41).
      onMouseDown={e => { pressedOnOverlay.current = e.target === overlayRef.current; }}
      onClick={e => {
        const both = pressedOnOverlay.current && e.target === overlayRef.current;
        pressedOnOverlay.current = false;
        if (both) onBackdrop?.();
      }}
    >
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        className={className}
      >
        <h3 id={titleId} className={titleClassName}>{title}</h3>
        {children}
      </div>
    </div>,
    document.body,
  );
}
