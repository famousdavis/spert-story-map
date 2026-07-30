// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import React, { useRef, useEffect, useCallback, useState } from 'react';

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;
const HINT_KEY = 'spert_map_hint_dismissed';

interface Pan {
  x: number;
  y: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- layout/drag objects passed from parent have complex computed shapes */
interface MapCanvasProps {
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  pan: Pan;
  setPan: React.Dispatch<React.SetStateAction<Pan>>;
  onFit: ((containerWidth: number, containerHeight: number) => void) | null;
  children: React.ReactNode;
  dragState: any;
  onDragMove?: (e: React.PointerEvent) => void;
  onDragEnd?: (e: React.PointerEvent) => void;
  /** Fired when the user clicks empty canvas (a press-release that didn't pan) — used to deselect. */
  onBackgroundClick?: () => void;
  overlayControls?: React.ReactNode;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default function MapCanvas({ zoom, setZoom, pan, setPan, onFit, children, dragState, onDragMove, onDragEnd, onBackgroundClick, overlayControls }: MapCanvasProps) {
  const containerRef = useRef(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panDistanceRef = useRef(0);

  // Reactive state for cursor and hint dismissal
  const [isPanning, setIsPanning] = useState(false);
  const [showHint, setShowHint] = useState(() => !localStorage.getItem(HINT_KEY));

  const dismissHint = useCallback(() => {
    localStorage.setItem(HINT_KEY, '1');
    setShowHint(false);
  }, []);

  // Wheel zoom (needs passive: false to preventDefault)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setZoom(prevZoom => {
        // Trackpad pinch sends ctrlKey with small deltas; mouse wheel sends larger deltas.
        // Use delta-proportional scaling so small gestures = small zoom changes.
        const sensitivity = e.ctrlKey ? 0.01 : 0.002;
        const delta = -e.deltaY * sensitivity;
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom * (1 + delta)));
        const scale = newZoom / prevZoom;

        setPan(prevPan => ({
          x: mouseX - (mouseX - prevPan.x) * scale,
          y: mouseY - (mouseY - prevPan.y) * scale,
        }));

        return newZoom;
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [setZoom, setPan]);

  // Pointer pan (disabled when dragging a rib)
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only left-click pans — ignore right-click, middle-click, etc.
    if (e.button !== 0) return;
    // Don't start panning if a drag is in progress
    if (dragState) return;
    // Don't pan when clicking interactive elements (cards, headers, labels, inputs)
    const interactive = e.target.closest('[data-rib-id], [data-backbone-id], [data-theme-id], [data-release-id], input, button, textarea, [role="menu"]');
    if (interactive) return;
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    panDistanceRef.current = 0;
    containerRef.current.setPointerCapture(e.pointerId);
    setIsPanning(true);
  }, [pan, dragState]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // If a rib drag is active, forward to drag handler
    if (dragState) {
      if (onDragMove) onDragMove(e);
      return;
    }
    if (!isPanningRef.current) return;
    const newX = e.clientX - panStartRef.current.x;
    const newY = e.clientY - panStartRef.current.y;
    panDistanceRef.current += Math.abs(newX - pan.x) + Math.abs(newY - pan.y);
    setPan({ x: newX, y: newY });
  }, [setPan, pan, dragState, onDragMove]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    // If a rib drag is active, forward to drag handler
    if (dragState) {
      if (onDragEnd) onDragEnd(e);
      return;
    }
    if (isPanningRef.current) {
      if (panDistanceRef.current >= 8) {
        dismissHint();
      } else if (onBackgroundClick) {
        // A press-release on empty canvas that didn't pan = a click → deselect.
        onBackgroundClick();
      }
    }
    isPanningRef.current = false;
    setIsPanning(false);
  }, [dragState, onDragEnd, dismissHint, onBackgroundClick]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      if (e.key === '=' || e.key === '+') {
        setZoom(z => Math.min(MAX_ZOOM, z + ZOOM_STEP));
      } else if (e.key === '-') {
        setZoom(z => Math.max(MIN_ZOOM, z - ZOOM_STEP));
      } else if (e.key === '0') {
        const el = containerRef.current;
        if (el && onFit) onFit(el.clientWidth, el.clientHeight);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setZoom, onFit]);

  const handleFitClick = () => {
    const el = containerRef.current;
    if (el && onFit) onFit(el.clientWidth, el.clientHeight);
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-gray-100 dark:bg-gray-800">
      {/* Pannable/zoomable area */}
      <div
        ref={containerRef}
        className="w-full h-full select-none"
        style={{ cursor: (dragState?.isDragging || isPanning) ? 'grabbing' : 'grab' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={e => e.preventDefault()}
        data-map-bg=""
        data-map-container=""
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
          data-map-bg=""
        >
          {children}
        </div>
      </div>

      {/* Zoom controls + optional overlay controls */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-2 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm px-1 py-1">
          <button
            onClick={() => setZoom(z => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
            className="w-7 h-7 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-sm font-medium"
            title="Zoom out (-)"
          >
            −
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums w-10 text-center select-none">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(z => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
            className="w-7 h-7 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-sm font-medium"
            title="Zoom in (+)"
          >
            +
          </button>
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />
          <button
            onClick={handleFitClick}
            className="px-2 h-7 flex items-center justify-center text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            title="Fit to screen (0)"
          >
            Fit
          </button>
        </div>
        {overlayControls && <div className="pointer-events-auto">{overlayControls}</div>}
      </div>

      {/* Pan/zoom discoverability hint — shown until first pan or dismissed */}
      {showHint && (
        <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 shadow-sm pointer-events-auto">
          <span className="text-xs text-gray-500 dark:text-gray-400 select-none">
            Drag to pan · Scroll to zoom
          </span>
          <button
            onClick={dismissHint}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-sm leading-none"
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
