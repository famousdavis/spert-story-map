// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useEffect, useId, useRef, useState } from 'react';

// Module-level counter — tracks simultaneously open Modal instances.
// Prevents body-scroll restoration races when modals nest (e.g., ShareDialog
// containing the Revoke ConfirmDialog). Escape follows `openDialogs` below (v0.59.0).
let openModalCount = 0;

// The open dialogs, oldest first (S2, v0.59.0). Only the last one keeps Tab inside it, so a ConfirmDialog opened from
// a ShareDialog holds the keyboard and the ShareDialog under it does not pull focus back.
const openDialogs: HTMLElement[] = [];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), '
  + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab and Shift+Tab wrap at the dialog's ends; from the dialog itself or from outside it, they bring focus in. */
function wrapTab(e: KeyboardEvent, root: HTMLElement) {
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter(el => !el.closest('[hidden]') && (typeof el.checkVisibility === 'function' ? el.checkVisibility() : true));
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) { e.preventDefault(); return; }
  const active = document.activeElement;
  const within = active instanceof HTMLElement && active !== root && root.contains(active);
  if (e.shiftKey && (active === first || !within)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !within)) {
    e.preventDefault();
    first.focus();
  }
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}

export default function Modal({ open, onClose, title, children, wide = false }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  // Track whether the pointer press *started* on the overlay itself. A `click`
  // dispatches on the common ancestor of the mousedown/mouseup targets, so a drag
  // that begins inside the card (resizing a textarea, selecting text) but releases
  // on the backdrop would otherwise resolve its click to the overlay and close us.
  // Gating on press-origin prevents that — only a true backdrop press-and-release closes.
  const pressedOnOverlay = useRef(false);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // What had focus when the dialog opened, read as it opens (before a child's autoFocus moves it), so focus can go
  // back there on close (S2, v0.59.0). A Modal mounted open reads it in its first render; one mounted closed, on the
  // render where `open` turns true.
  const [opener, setOpener] = useState<Element | null>(() => (open ? document.activeElement : null));
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setOpener(open ? document.activeElement : null);
  }

  // Focus in on open, Tab kept inside while it is the top dialog, focus back to the opener on close (S2, v0.59.0).
  // Separate from the effect below, whose `onClose` dependency can change on every render of the caller.
  useEffect(() => {
    const root = dialogRef.current;
    if (!open || !root) return;
    openDialogs.push(root);
    // A child that took focus as it mounted (SizingRibModal's name field) keeps it; otherwise the dialog itself takes
    // it, so its title is announced and the next Tab reaches its first control.
    if (!root.contains(document.activeElement)) root.focus();
    const handleTab = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && openDialogs[openDialogs.length - 1] === root) wrapTab(e, root);
    };
    document.addEventListener('keydown', handleTab);
    return () => {
      document.removeEventListener('keydown', handleTab);
      const i = openDialogs.lastIndexOf(root);
      if (i >= 0) openDialogs.splice(i, 1);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open, opener]);

  useEffect(() => {
    if (!open) return;

    openModalCount += 1;

    if (openModalCount === 1) {
      document.body.style.overflow = 'hidden';
    }

    // Escape closes the top dialog only (v0.59.0: the top of `openDialogs`, not this effect's depth, which re-counts
    // whenever a caller's `onClose` changes identity and could then close the dialog underneath).
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dialogRef.current && openDialogs[openDialogs.length - 1] === dialogRef.current) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      openModalCount -= 1;
      if (openModalCount === 0) {
        document.body.style.overflow = '';
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => { pressedOnOverlay.current = e.target === overlayRef.current; }}
      onClick={(e) => {
        if (e.target === overlayRef.current && pressedOnOverlay.current) onClose();
        pressedOnOverlay.current = false;
      }}
    >
      {/* A dialog, modal, named by its title (v0.58.0): every Modal and every ConfirmDialog. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`outline-none bg-white dark:bg-gray-900 rounded-xl shadow-2xl ${wide ? 'w-full max-w-2xl' : 'w-full max-w-md'} max-h-[90vh] flex flex-col`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          {/* Named "Close" for screen readers; the × is drawn for the eye alone (S1, v0.59.0). */}
          <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl leading-none"><span aria-hidden="true">&times;</span></button>
        </div>
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
