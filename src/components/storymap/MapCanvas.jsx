import { useRef, useEffect, useCallback } from 'react';

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;

export default function MapCanvas({ zoom, setZoom, pan, setPan, onFit, children, dragState, onDragMove, onDragEnd }) {
  const containerRef = useRef(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  // Wheel zoom (needs passive: false to preventDefault)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e) => {
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

  // Window-level listeners for drag move/end — ensures reliable event delivery
  // even when pointer is over child elements (grips, cards, etc.) or outside the canvas
  useEffect(() => {
    if (!dragState) return;

    const handleMove = (e) => {
      if (onDragMove) onDragMove(e);
    };
    const handleUp = () => {
      if (onDragEnd) onDragEnd();
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragState, onDragMove, onDragEnd]);

  // Pointer pan (disabled when dragging a rib)
  const handlePointerDown = useCallback((e) => {
    // Don't start panning if a drag is in progress
    if (dragState) return;
    // Don't pan when clicking on interactive elements (rib cards, release labels)
    // Walk up from e.target to check for known interactive data attributes
    let el = e.target;
    while (el && el !== containerRef.current) {
      if (el.dataset?.ribId || el.dataset?.releaseId) return;
      el = el.parentElement;
    }
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    containerRef.current.setPointerCapture(e.pointerId);
  }, [pan, dragState]);

  const handlePointerMove = useCallback((e) => {
    // Drag move is handled by window-level listeners; this only handles pan
    if (dragState) return;
    if (!isPanningRef.current) return;
    setPan({
      x: e.clientX - panStartRef.current.x,
      y: e.clientY - panStartRef.current.y,
    });
  }, [setPan, dragState]);

  const handlePointerUp = useCallback(() => {
    // Drag end is handled by window-level listeners; this only handles pan
    if (dragState) return;
    isPanningRef.current = false;
  }, [dragState]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
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
    <div className="relative w-full h-full overflow-hidden bg-gray-100">
      {/* Pannable/zoomable area */}
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ cursor: dragState?.isDragging ? 'grabbing' : 'grab' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
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

      {/* Zoom controls overlay */}
      <div className="absolute top-3 right-3 flex items-center gap-1 bg-white border border-gray-200 rounded-lg shadow-sm px-1 py-1">
        <button
          onClick={() => setZoom(z => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
          className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded text-sm font-medium"
          title="Zoom in (+)"
        >
          +
        </button>
        <span className="text-xs text-gray-500 tabular-nums w-10 text-center select-none">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(z => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
          className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded text-sm font-medium"
          title="Zoom out (-)"
        >
          −
        </button>
        <div className="w-px h-5 bg-gray-200 mx-0.5" />
        <button
          onClick={handleFitClick}
          className="px-2 h-7 flex items-center justify-center text-xs text-gray-600 hover:bg-gray-100 rounded"
          title="Fit to screen (0)"
        >
          Fit
        </button>
      </div>
    </div>
  );
}
