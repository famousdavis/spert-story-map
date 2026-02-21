import { useState, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  getAllRibItems, getReleasePercentComplete, getProgressOverTime, getSprintSummary,
} from '../lib/calculations';
import {
  updateProgress as doUpdateProgress,
  removeProgress as doRemoveProgress,
  updateComment as doUpdateComment,
} from '../lib/progressMutations';
import {
  getCommentCount, getCommentHistory,
  getSprintPct, getCurrentPct, getDelta,
} from '../lib/progressViewHelpers';
import { useProductMutations } from '../hooks/useProductMutations';
import ProgressBar from '../components/ui/ProgressBar';
import CollapsibleSection from '../components/ui/CollapsibleSection';
import SprintSummaryCard from '../components/progress/SprintSummaryCard';
import BurnUpChart from '../components/progress/BurnUpChart';
import ProgressRow from '../components/progress/ProgressRow';
import GroupSummaryHeader from '../components/progress/GroupSummaryHeader';
import ProgressHeader from '../components/progress/ProgressHeader';

export default function ProgressTrackingView() {
  const { product, updateProduct } = useOutletContext();
  const { addSprint } = useProductMutations(updateProduct);
  const [selectedSprint, setSelectedSprint] = useState(
    product.sprints.length > 0 ? product.sprints[product.sprints.length - 1].id : null
  );
  const [groupBy, setGroupBy] = useState('release');
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [commentDrafts, setCommentDrafts] = useState({});
  const [showReleaseBars, setShowReleaseBars] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [progressDrafts, setProgressDrafts] = useState({});
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  // Track previous sprint/groupBy to reset transient state on change
  const [lastSprint, setLastSprint] = useState(selectedSprint);
  const [lastGroupBy, setLastGroupBy] = useState(groupBy);
  if (lastSprint !== selectedSprint) {
    setLastSprint(selectedSprint);
    setExpandedRows(new Set());
    setCommentDrafts({});
    setProgressDrafts({});
    setCollapsedGroups(new Set());
  }
  if (lastGroupBy !== groupBy) {
    setLastGroupBy(groupBy);
    setCollapsedGroups(new Set());
  }

  const toggleRow = (rowKey) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const toggleGroup = (groupKey) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const allRibs = useMemo(() => getAllRibItems(product), [product]);
  const assignedRibs = useMemo(() => allRibs.filter(r => r.releaseAllocations.length > 0), [allRibs]);
  const progressData = useMemo(() => getProgressOverTime(product), [product]);
  const sprintSummary = useMemo(() => getSprintSummary(product, selectedSprint), [product, selectedSprint]);

  const sprint = product.sprints.find(s => s.id === selectedSprint);
  const prevSprint = sprint ? product.sprints.find(s => s.order === sprint.order - 1) : null;
  const showTargetCol = groupBy === 'release';
  const totalCols = 5 + (showTargetCol ? 1 : 0) + (prevSprint ? 1 : 0);

  // Sprint order lookup for sorting comment history
  const sprintOrder = useMemo(() => {
    const order = {};
    product.sprints.forEach(s => { order[s.id] = s.order; });
    return order;
  }, [product.sprints]);

  const sprintNameMap = useMemo(() => {
    const map = {};
    product.sprints.forEach(s => { map[s.id] = s.name; });
    return map;
  }, [product.sprints]);

  // Thin wrappers that bind updateProduct + selectedSprint
  const updateProgress = (ribId, releaseId, percentComplete) => {
    doUpdateProgress(updateProduct, ribId, releaseId, selectedSprint, percentComplete);
  };
  const removeProgress = (ribId, releaseId) => {
    doRemoveProgress(updateProduct, ribId, releaseId, selectedSprint);
  };
  const updateComment = (ribId, releaseId, comment) => {
    doUpdateComment(updateProduct, ribId, releaseId, selectedSprint, comment);
  };

  // Bind pure helpers to component-level lookup maps
  const boundGetCommentHistory = useCallback(
    (rib, releaseId) => getCommentHistory(rib, releaseId, sprintNameMap, sprintOrder),
    [sprintNameMap, sprintOrder]
  );
  const boundGetSprintPct = useCallback(
    (rib, releaseId) => getSprintPct(rib, releaseId, selectedSprint),
    [selectedSprint]
  );
  const boundGetDelta = useCallback(
    (rib, releaseId) => getDelta(rib, releaseId, sprint, prevSprint, selectedSprint),
    [sprint, prevSprint, selectedSprint]
  );

  // Build rows
  const grouped = useMemo(() => {
    const groups = {};

    if (groupBy === 'release') {
      for (const rib of assignedRibs) {
        for (const alloc of rib.releaseAllocations) {
          const release = product.releases.find(r => r.id === alloc.releaseId);
          const key = alloc.releaseId;
          const label = release?.name || 'Unknown Release';
          if (!groups[key]) groups[key] = { label, releaseId: key, items: [] };
          groups[key].items.push({
            ...rib,
            _releaseId: alloc.releaseId,
            _releaseName: release?.name || '',
            _allocPct: alloc.percentage,
            _editable: true,
          });
        }
      }
      const releaseOrder = {};
      product.releases.forEach(r => { releaseOrder[r.id] = r.order; });
      const result = Object.values(groups).sort((a, b) => (releaseOrder[a.releaseId] || 0) - (releaseOrder[b.releaseId] || 0));
      for (const g of result) {
        g.items.sort((a, b) => a.backboneName.localeCompare(b.backboneName) || a.name.localeCompare(b.name));
      }
      return result;
    }

    for (const rib of assignedRibs) {
      let key, label;
      if (groupBy === 'backbone') {
        key = rib.backboneId;
        label = rib.backboneName;
      } else {
        key = rib.themeId;
        label = rib.themeName;
      }
      if (!groups[key]) groups[key] = { label, entityId: key, items: [] };
      groups[key].items.push({
        ...rib,
        _releaseId: null,
        _allocPct: null,
        _editable: false,
      });
    }
    const result = Object.values(groups);
    for (const g of result) {
      g.items.sort((a, b) => a.name.localeCompare(b.name));
    }
    return result;
  }, [assignedRibs, groupBy, product.releases]);

  // Collect all row keys for expand-all
  const allRowKeys = useMemo(() => {
    const keys = [];
    grouped.forEach(group => {
      group.items.forEach((rib, idx) => {
        keys.push(`${rib.id}-${rib._releaseId || idx}`);
      });
    });
    return keys;
  }, [grouped]);

  const allExpanded = expandedRows.size > 0 && expandedRows.size >= allRowKeys.length;

  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpandedRows(new Set());
    } else {
      setExpandedRows(new Set(allRowKeys));
    }
  };

  return (
    <div>
      <ProgressHeader
        selectedSprint={selectedSprint}
        setSelectedSprint={setSelectedSprint}
        sprints={product.sprints}
        addSprint={addSprint}
        groupBy={groupBy}
        setGroupBy={setGroupBy}
        allExpanded={allExpanded}
        toggleExpandAll={toggleExpandAll}
        hasAssignedRibs={assignedRibs.length > 0}
        percentComplete={sprintSummary?.percentComplete ?? 0}
      />

      {/* Progress bars: Total, Core, Non-core */}
      <div className="mb-6 space-y-2">
        {[
          { label: 'Total', pct: sprintSummary?.percentComplete ?? 0, color: 'bg-blue-500' },
          { label: 'Core', pct: sprintSummary?.core.percentComplete ?? 0, color: 'bg-teal-500' },
          { label: 'Non-core', pct: sprintSummary?.nonCore.percentComplete ?? 0, color: 'bg-amber-500' },
        ].map(({ label, pct, color }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-18 flex-shrink-0">{label}</span>
            <div className="flex-1">
              <ProgressBar percent={pct} height="h-2.5" color={color} />
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums w-10 text-right flex-shrink-0">{Math.round(pct)}%</span>
          </div>
        ))}
      </div>

      {/* Sprint summary stats */}
      {sprintSummary && (
        <SprintSummaryCard summary={sprintSummary} />
      )}

      {/* Release progress bars (collapsible) */}
      {product.releases.length > 0 && (
        <CollapsibleSection label="Release Progress" open={showReleaseBars} onToggle={() => setShowReleaseBars(v => !v)}>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-4 space-y-3">
            {product.releases.map(release => {
              const pct = getReleasePercentComplete(product, release.id, selectedSprint);
              return (
                <div key={release.id} className="flex items-center gap-4">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-40 truncate flex-shrink-0">{release.name}</span>
                  <div className="flex-1">
                    <ProgressBar percent={pct} height="h-2" />
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums w-10 text-right flex-shrink-0">{Math.round(pct)}%</span>
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* Burn-up chart (collapsible) */}
      {progressData.length > 1 && (
        <CollapsibleSection label="Progress Over Time" open={showChart} onToggle={() => setShowChart(v => !v)}>
          <BurnUpChart data={progressData} />
        </CollapsibleSection>
      )}

      {/* Rib item progress table */}
      {product.sprints.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <p>No sprints defined. Add sprints in Settings to start tracking progress.</p>
        </div>
      ) : assignedRibs.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <p>No rib items assigned to releases yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => {
            const groupKey = group.releaseId || group.entityId;
            const isCollapsed = collapsedGroups.has(groupKey);
            return (
              <div key={groupKey}>
                <GroupSummaryHeader
                  label={group.label}
                  items={group.items}
                  sizeMapping={product.sizeMapping}
                  groupBy={groupBy}
                  releaseId={group.releaseId}
                  product={product}
                  collapsed={isCollapsed}
                  onToggle={() => toggleGroup(groupKey)}
                />
                {!isCollapsed && (
                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400">
                          <th className="text-left px-3 py-2 font-medium" style={{ width: '40%' }}>Rib Item</th>
                          <th className="text-center px-2 py-2 font-medium w-12">Size</th>
                          <th className="text-center px-2 py-2 font-medium w-12">Pts</th>
                          {showTargetCol && <th className="text-center px-2 py-2 font-medium w-14">Alloc</th>}
                          <th className="text-center px-2 py-2 font-medium w-16">Done</th>
                          <th className="text-center px-2 py-2 font-medium w-20">
                            {sprint?.name || 'Sprint'}
                          </th>
                          {prevSprint && <th className="text-center px-2 py-2 font-medium w-14">Δ</th>}
                          <th className="px-2 py-2 font-medium w-24">Progress</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                        {group.items.map((rib, idx) => (
                          <ProgressRow
                            key={`${rib.id}-${rib._releaseId || idx}`}
                            rib={rib}
                            idx={idx}
                            sprint={sprint}
                            prevSprint={prevSprint}
                            selectedSprint={selectedSprint}
                            showTargetCol={showTargetCol}
                            totalCols={totalCols}
                            expandedRows={expandedRows}
                            toggleRow={toggleRow}
                            commentDrafts={commentDrafts}
                            setCommentDrafts={setCommentDrafts}
                            progressDrafts={progressDrafts}
                            setProgressDrafts={setProgressDrafts}
                            getSprintPct={boundGetSprintPct}
                            getCurrentPct={getCurrentPct}
                            getDelta={boundGetDelta}
                            getCommentCount={getCommentCount}
                            getCommentHistory={boundGetCommentHistory}
                            updateProgress={updateProgress}
                            removeProgress={removeProgress}
                            updateComment={updateComment}
                            sizeMapping={product.sizeMapping}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
