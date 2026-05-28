// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useEffect, useRef } from 'react';
import type React from 'react';

/**
 * Edge auto-scroll for canvas drag operations on Map and Sizing tabs.
 *
 * When a drag is active and the pointer enters a 60px-wide band along the
 * inside of the canvas viewport, the canvas pans automatically — speed scales
 * linearly with how close the pointer is to the edge. Both axes are independent.
 *
 * Implementation:
 *   1. While `isDragging`, run a requestAnimationFrame loop.
 *   2. Each frame, read the pointer's last reported screen coords from
 *      `pointerRef` (kept fresh by the drag hook) and the container's current
 *      bounding rect. Compute per-axis pan deltas.
 *   3. Apply via `setPan`. Synthesize a `pointermove` on the container so the
 *      drag hook re-runs hit-testing against the new pan, keeping drop-target
 *      indicators accurate even when the user holds the pointer still.
 *   4. Stop the loop the moment the drag ends.
 */

export const EDGE_ZONE_PX = 60;
export const MAX_PAN_SPEED = 20;

export interface EdgeAutoPanArgs {
  isDragging: boolean;
  pointerRef: React.MutableRefObject<{ screenX: number; screenY: number } | null>;
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  /** CSS selector for the scrollable canvas element. Defaults to '[data-map-container]'. */
  containerSelector?: string;
}

/**
 * Compute per-axis pan delta given a pointer position and a container rect.
 * Pure function — exported for tests.
 *
 * Sign convention matches the canvas's pan transform: positive `pan.x` shifts
 * content right (revealing what was off the left), so pointer-near-left → +dx.
 */
export function computeEdgeAutoPanDelta(
  screenX: number,
  screenY: number,
  rect: { left: number; right: number; top: number; bottom: number },
  edgeZone: number = EDGE_ZONE_PX,
  maxSpeed: number = MAX_PAN_SPEED,
): { dx: number; dy: number } {
  const leftDist = screenX - rect.left;
  const rightDist = rect.right - screenX;
  const topDist = screenY - rect.top;
  const bottomDist = rect.bottom - screenY;

  let dx = 0;
  let dy = 0;

  if (leftDist < edgeZone) {
    const depth = Math.min(1, Math.max(0, (edgeZone - leftDist) / edgeZone));
    dx = maxSpeed * depth;
  } else if (rightDist < edgeZone) {
    const depth = Math.min(1, Math.max(0, (edgeZone - rightDist) / edgeZone));
    dx = -maxSpeed * depth;
  }

  if (topDist < edgeZone) {
    const depth = Math.min(1, Math.max(0, (edgeZone - topDist) / edgeZone));
    dy = maxSpeed * depth;
  } else if (bottomDist < edgeZone) {
    const depth = Math.min(1, Math.max(0, (edgeZone - bottomDist) / edgeZone));
    dy = -maxSpeed * depth;
  }

  return { dx, dy };
}

export default function useEdgeAutoPan({
  isDragging,
  pointerRef,
  setPan,
  containerSelector = '[data-map-container]',
}: EdgeAutoPanArgs): void {
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isDragging) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = () => {
      const ptr = pointerRef.current;
      if (!ptr) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const container = document.querySelector(containerSelector) as HTMLElement | null;
      if (!container) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const rect = container.getBoundingClientRect();
      const { dx, dy } = computeEdgeAutoPanDelta(ptr.screenX, ptr.screenY, rect);

      if (dx !== 0 || dy !== 0) {
        setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        // Synthesize a pointermove so the drag hook re-runs hit-testing
        // against the new pan (the user may hold the pointer still while we scroll).
        try {
          container.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            clientX: ptr.screenX,
            clientY: ptr.screenY,
            pointerType: 'mouse',
          }));
        } catch {
          // PointerEvent constructor unavailable — pan still happens, only the
          // hit-test refresh is skipped. Next real pointermove will catch up.
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isDragging, pointerRef, setPan, containerSelector]);
}
