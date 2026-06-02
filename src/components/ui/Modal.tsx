// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useEffect, useRef } from 'react';

// Module-level counter — tracks simultaneously open Modal instances.
// Prevents Escape cascades and body-scroll restoration races when modals
// nest (e.g., ShareDialog containing the Revoke ConfirmDialog).
let openModalCount = 0;

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

  useEffect(() => {
    if (!open) return;

    openModalCount += 1;
    const myDepth = openModalCount;

    if (myDepth === 1) {
      document.body.style.overflow = 'hidden';
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openModalCount === myDepth) {
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
      <div className={`bg-white dark:bg-gray-900 rounded-xl shadow-2xl ${wide ? 'w-full max-w-2xl' : 'w-full max-w-md'} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
