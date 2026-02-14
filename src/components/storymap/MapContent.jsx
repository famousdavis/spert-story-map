import { useEffect } from 'react';
import ThemeHeader from './ThemeHeader';
import BackboneHeader from './BackboneHeader';
import ReleaseDivider from './ReleaseDivider';
import RibCell from './RibCell';
import UnassignedLane from './UnassignedLane';
import DropHighlight from './DropHighlight';

export default function MapContent({
  layout, onRibClick, mapSizeRef,
  onRenameTheme, onRenameBackbone, onRenameRib,
  dragState, onDragStart, onBackboneDragStart,
}) {
  const { columns, themeSpans, releaseLanes, cells, unassignedLane, totalWidth, totalHeight } = layout;

  // Expose map size to parent for fit-to-screen
  useEffect(() => {
    if (mapSizeRef) {
      mapSizeRef.current = { width: totalWidth, height: totalHeight };
    }
  }, [totalWidth, totalHeight, mapSizeRef]);

  // Build a theme index lookup for backbone coloring
  const themeIndexMap = {};
  themeSpans.forEach((ts, i) => { themeIndexMap[ts.themeId] = i; });

  // Determine highlighted drop zones from drag state
  const isRibDrag = dragState?.isDragging && dragState.dragType === 'rib';
  const isBackboneDrag = dragState?.isDragging && dragState.dragType === 'backbone';
  const highlightReleaseId = isRibDrag && dragState.axis === 'y' ? dragState.targetReleaseId : undefined;
  const highlightBackboneId = isRibDrag && dragState.axis === 'x' ? dragState.targetBackboneId : undefined;
  const highlightThemeId = isBackboneDrag ? dragState.targetThemeId : undefined;

  if (themeSpans.length === 0) {
    return (
      <div className="p-12 text-center text-gray-400" data-map-bg="">
        <p className="text-lg mb-2">No themes defined yet</p>
        <p className="text-sm">Add themes and backbone items in the Structure tab to see the story map.</p>
      </div>
    );
  }

  return (
    <div
      className="relative"
      style={{ width: totalWidth, height: totalHeight, minWidth: totalWidth, minHeight: totalHeight }}
      data-map-bg=""
    >
      {/* Theme headers */}
      {themeSpans.map((ts, i) => (
        <ThemeHeader
          key={ts.themeId}
          themeSpan={ts}
          index={i}
          onRename={onRenameTheme}
          isDropTarget={highlightThemeId === ts.themeId && ts.themeId !== dragState?.themeId}
        />
      ))}

      {/* Backbone headers */}
      {columns.map(col => (
        <BackboneHeader
          key={col.backboneId}
          column={col}
          themeIndex={themeIndexMap[col.themeId] || 0}
          onRename={onRenameBackbone}
          isDropTarget={highlightBackboneId === col.backboneId}
          isDragging={isBackboneDrag && dragState.backboneId === col.backboneId}
          onDragStart={onBackboneDragStart}
        />
      ))}

      {/* Release divider lines and labels */}
      {releaseLanes.map((lane, i) => (
        <ReleaseDivider
          key={lane.releaseId}
          lane={lane}
          totalWidth={totalWidth}
          isFirst={i === 0}
          isDropTarget={highlightReleaseId === lane.releaseId}
        />
      ))}

      {/* Unassigned lane */}
      {unassignedLane && (
        <UnassignedLane
          lane={unassignedLane}
          totalWidth={totalWidth}
          isDropTarget={highlightReleaseId === null && isRibDrag && dragState.axis === 'y'}
        />
      )}

      {/* Column divider lines (subtle vertical guides) */}
      {columns.map(col => (
        <div
          key={`vline-${col.backboneId}`}
          className="absolute bg-gray-100"
          style={{
            left: col.x + col.width + 2,
            top: 0,
            width: 1,
            height: totalHeight,
          }}
        />
      ))}

      {/* Drop target highlights */}
      <DropHighlight
        columns={columns}
        themeSpans={themeSpans}
        totalHeight={totalHeight}
        highlightBackboneId={highlightBackboneId}
        highlightThemeId={highlightThemeId}
        dragSourceThemeId={dragState?.themeId}
      />

      {/* Rib cells */}
      {cells.map(cell => (
        <RibCell
          key={`${cell.id}-${cell.releaseId || 'unassigned'}`}
          cell={cell}
          onClick={onRibClick}
          onRename={onRenameRib}
          onDragStart={onDragStart}
          isDragging={isRibDrag && dragState.ribId === cell.id && dragState.releaseId === cell.releaseId}
        />
      ))}
    </div>
  );
}
