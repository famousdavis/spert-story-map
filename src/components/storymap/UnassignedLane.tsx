// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { LANE_LABEL_WIDTH, RIGHT_LABEL_WIDTH } from './useMapLayout';

interface LaneData {
  y: number;
  height: number;
}

interface UnassignedLaneProps {
  lane: LaneData;
  totalWidth: number;
  isDropTarget: boolean;
}

/**
 * Renders the "Unassigned" lane at the bottom of the story map.
 * Mirrored labels on left and right sides. No + Release or delete buttons.
 */
export default function UnassignedLane({ lane, totalWidth, isDropTarget }: UnassignedLaneProps) {
  const rightLabelX = totalWidth - RIGHT_LABEL_WIDTH;

  return (
    <>
      <div
        className={`absolute left-0 transition-colors ${
          isDropTarget ? 'bg-blue-100/60 dark:bg-blue-900/30' : 'bg-amber-50/40 dark:bg-amber-900/20'
        }`}
        style={{ top: lane.y, width: totalWidth, height: lane.height }}
      />
      <div
        className={`absolute left-0 h-px border-t border-dashed ${
          isDropTarget ? 'border-blue-400 dark:border-blue-500' : 'border-amber-300 dark:border-amber-700'
        }`}
        style={{ top: lane.y, width: totalWidth }}
      />
      {/* Left label */}
      <div
        className="absolute flex items-start pt-2 px-2"
        style={{ top: lane.y, left: 0, width: LANE_LABEL_WIDTH, height: lane.height }}
      >
        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2 py-1 rounded">
          Unassigned
        </span>
      </div>
      {/* Right label */}
      <div
        className="absolute flex items-start pt-2 px-2"
        style={{ top: lane.y, left: rightLabelX, width: RIGHT_LABEL_WIDTH, height: lane.height }}
      >
        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2 py-1 rounded">
          Unassigned
        </span>
      </div>
    </>
  );
}
