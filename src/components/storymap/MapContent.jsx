import { useEffect } from 'react';
import { COL_WIDTH, COL_GAP, THEME_HEIGHT, BACKBONE_HEIGHT, LANE_LABEL_WIDTH } from './useMapLayout';
import ThemeHeader from './ThemeHeader';
import BackboneHeader from './BackboneHeader';
import ReleaseDivider from './ReleaseDivider';
import RibCell from './RibCell';
import UnassignedLane from './UnassignedLane';
import DropHighlight from './DropHighlight';
import InsertionIndicator from './InsertionIndicator';

export default function MapContent({
  layout, onRibClick, mapSizeRef,
  onRenameTheme, onRenameBackbone, onRenameRib,
  onDeleteTheme, onDeleteBackbone, onDeleteRib,
  onAddTheme, onAddBackbone, onAddRib,
  dragState, onDragStart, onBackboneDragStart, onThemeDragStart,
  selectedIds,
}) {
  const { columns, themeSpans, releaseLanes, cells, unassignedLane, totalWidth, totalHeight } = layout;

  // Extra width for the "+ Theme" button
  const addBtnWidth = 100;
  const mapWidth = themeSpans.length > 0 ? totalWidth + COL_GAP + addBtnWidth : addBtnWidth + LANE_LABEL_WIDTH;
  const mapHeight = Math.max(totalHeight, THEME_HEIGHT + BACKBONE_HEIGHT + 72);

  // Expose map size to parent for fit-to-screen
  useEffect(() => {
    if (mapSizeRef) {
      mapSizeRef.current = { width: mapWidth, height: mapHeight };
    }
  }, [mapWidth, mapHeight, mapSizeRef]);

  // Build a theme index lookup for backbone coloring
  const themeIndexMap = {};
  themeSpans.forEach((ts, i) => { themeIndexMap[ts.themeId] = i; });

  // Determine highlighted drop zones from drag state
  const isRibDrag = dragState?.isDragging && dragState.dragType === 'rib';
  const isBackboneDrag = dragState?.isDragging && dragState.dragType === 'backbone';
  const isThemeDrag = dragState?.isDragging && dragState.dragType === 'theme';
  const highlightReleaseId = isRibDrag ? dragState.targetReleaseId : undefined;
  const highlightBackboneId = isRibDrag ? dragState.targetBackboneId : undefined;
  const highlightThemeId = isBackboneDrag ? dragState.targetThemeId : undefined;

  if (themeSpans.length === 0) {
    return (
      <div className="relative" style={{ width: mapWidth, height: mapHeight }} data-map-bg="">
        <p className="absolute left-32 top-16 text-gray-400 text-sm">No themes yet — add one to get started.</p>
        {onAddTheme && (
          <button
            className="absolute bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium rounded px-2 py-1 transition-colors"
            style={{ left: LANE_LABEL_WIDTH, top: 4, height: 32 }}
            onClick={onAddTheme}
          >
            + Theme
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="relative"
      style={{ width: mapWidth, height: mapHeight, minWidth: mapWidth, minHeight: mapHeight }}
      data-map-bg=""
    >
      {/* Theme headers */}
      {themeSpans.map((ts, i) => (
        <ThemeHeader
          key={ts.themeId}
          themeSpan={ts}
          index={i}
          onRename={onRenameTheme}
          onDelete={onDeleteTheme}
          isDropTarget={highlightThemeId === ts.themeId && ts.themeId !== dragState?.themeId}
          isDragging={isThemeDrag && dragState.themeId === ts.themeId}
          onDragStart={onThemeDragStart}
        />
      ))}

      {/* Backbone headers */}
      {columns.map(col => (
        <BackboneHeader
          key={col.backboneId}
          column={col}
          themeIndex={themeIndexMap[col.themeId] || 0}
          onRename={onRenameBackbone}
          onDelete={onDeleteBackbone}
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
          isDropTarget={highlightReleaseId === null && isRibDrag}
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
        releaseLanes={releaseLanes}
        unassignedLane={unassignedLane}
        totalHeight={totalHeight}
        highlightBackboneId={highlightBackboneId}
        highlightReleaseId={highlightReleaseId}
        highlightThemeId={highlightThemeId}
        dragSourceThemeId={dragState?.themeId}
      />

      {/* Insertion indicator (blue line showing drop position) */}
      {dragState && <InsertionIndicator dragState={dragState} layout={layout} />}

      {/* Rib cells */}
      {cells.map(cell => {
        const draggedIds = isRibDrag ? (dragState.selectedIds || new Set([dragState.ribId])) : null;
        return (
          <RibCell
            key={`${cell.id}-${cell.releaseId || 'unassigned'}`}
            cell={cell}
            onClick={onRibClick}
            onRename={onRenameRib}
            onDelete={onDeleteRib}
            onDragStart={onDragStart}
            isDragging={draggedIds?.has(cell.id)}
            isSelected={selectedIds?.has(cell.id)}
          />
        );
      })}

      {/* + Theme button (after last theme) */}
      {onAddTheme && (
        <button
          className="absolute bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium rounded px-2 py-1 transition-colors"
          style={{ left: totalWidth + COL_GAP, top: 4, height: 32 }}
          onClick={onAddTheme}
        >
          + Theme
        </button>
      )}

      {/* + Backbone button (below + Theme, adds to last theme) */}
      {onAddBackbone && (
        <button
          className="absolute bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium rounded px-2 py-1 whitespace-nowrap transition-colors"
          style={{ left: totalWidth + COL_GAP, top: THEME_HEIGHT + 2, height: 28 }}
          onClick={() => onAddBackbone(themeSpans[themeSpans.length - 1].themeId)}
        >
          + Backbone
        </button>
      )}

      {/* + Rib buttons (bottom of each backbone column) */}
      {onAddRib && columns.map(col => {
        const bottomY = totalHeight - 4;
        return (
          <button
            key={`add-rib-${col.backboneId}`}
            className="absolute bg-gray-50 hover:bg-gray-200 text-gray-400 hover:text-gray-600 text-[10px] rounded px-1 py-0.5 transition-colors"
            style={{ left: col.x + 4, bottom: undefined, top: bottomY - 20, width: col.width - 8 }}
            onClick={() => onAddRib(col.themeId, col.backboneId)}
            title="Add rib item"
          >
            + Rib
          </button>
        );
      })}
    </div>
  );
}
