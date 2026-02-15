import { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  getAllRibItems, getRibItemPercentComplete,
  getReleasePercentComplete, getProgressOverTime,
  getRibReleaseProgressForSprint, getRibReleaseProgress, getSprintSummary,
} from '../lib/calculations';
import {
  updateProgress as doUpdateProgress,
  removeProgress as doRemoveProgress,
  updateComment as doUpdateComment,
} from '../lib/progressMutations';
import { useProductMutations } from '../hooks/useProductMutations';
import ProgressBar from '../components/ui/ProgressBar';
import CollapsibleSection from '../components/ui/CollapsibleSection';
import SprintSummaryCard from '../components/progress/SprintSummaryCard';
import BurnUpChart from '../components/progress/BurnUpChart';
import ProgressRow from '../components/progress/ProgressRow';

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
  // Track previous sprint selection to reset transient state on change
  const [lastSprint, setLastSprint] = useState(selectedSprint);
  if (lastSprint !== selectedSprint) {
    setLastSprint(selectedSprint);
    setExpandedRows(new Set());
    setCommentDrafts({});
    setProgressDrafts({});
  }

  const toggleRow = (rowKey) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
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

  // Count non-empty comments for a rib+release
  const getCommentCount = (rib, releaseId) => {
    if (!rib.progressHistory) return 0;
    if (releaseId) {
      return rib.progressHistory.filter(p => p.releaseId === releaseId && p.comment).length;
    }
    return rib.progressHistory.filter(p => p.comment).length;
  };

  // Get comment history for a rib+release, sorted newest-first by sprint order
  const getCommentHistory = (rib, releaseId) => {
    if (!rib.progressHistory) return [];
    const entries = releaseId
      ? rib.progressHistory.filter(p => p.releaseId === releaseId && p.comment)
      : rib.progressHistory.filter(p => p.comment);
    return entries
      .map(e => ({
        ...e,
        sprintName: sprintNameMap[e.sprintId] || 'Unknown',
        order: sprintOrder[e.sprintId] ?? 0,
      }))
      .sort((a, b) => b.order - a.order);
  };

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
      if (!groups[key]) groups[key] = { label, items: [] };
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

  const getSprintPct = (rib, releaseId) => {
    if (!selectedSprint) return null;
    if (releaseId) {
      return getRibReleaseProgressForSprint(rib, releaseId, selectedSprint);
    }
    const entries = (rib.progressHistory?.filter(p => p.sprintId === selectedSprint) || [])
      .filter(e => e.percentComplete !== null);
    return entries.length > 0 ? Math.min(100, entries.reduce((s, e) => s + e.percentComplete, 0)) : null;
  };

  const getCurrentPct = (rib, releaseId) => {
    if (releaseId) return getRibReleaseProgress(rib, releaseId);
    return getRibItemPercentComplete(rib);
  };

  const getDelta = (rib, releaseId) => {
    if (!sprint || !prevSprint) return null;
    const current = getSprintPct(rib, releaseId);
    if (current === null) return null;
    let prev;
    if (releaseId) {
      prev = getRibReleaseProgressForSprint(rib, releaseId, prevSprint.id);
    } else {
      const entries = (rib.progressHistory?.filter(p => p.sprintId === prevSprint.id) || [])
        .filter(e => e.percentComplete !== null);
      prev = entries.length > 0 ? entries.reduce((s, e) => s + e.percentComplete, 0) : null;
    }
    return current - (prev || 0);
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    try {
      const d = iso.length === 10 ? new Date(iso + 'T00:00:00') : new Date(iso);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return ''; }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Progress Tracking</h2>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Project: <span className="font-medium text-gray-700 dark:text-gray-300">{Math.round(sprintSummary?.percentComplete ?? 0)}%</span> complete
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Sprint:</span>
            <select
              value={selectedSprint || ''}
              onChange={e => setSelectedSprint(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-400 dark:focus:border-blue-500 outline-none"
            >
              {product.sprints.length === 0 && <option value="">No sprints defined</option>}
              {product.sprints.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              onClick={() => addSprint(setSelectedSprint)}
              className="text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 text-lg leading-none px-1"
              title="Add sprint"
            >
              +
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Group:</span>
            {['release', 'backbone', 'theme'].map(g => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`px-2 py-1 text-xs rounded ${groupBy === g ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'}`}
              >
                {g.charAt(0).toUpperCase() + g.slice(1)}
              </button>
            ))}
          </div>
          {assignedRibs.length > 0 && (
            <button
              onClick={toggleExpandAll}
              className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              title={allExpanded ? 'Collapse all notes' : 'Expand all notes'}
            >
              {allExpanded ? 'Collapse All' : 'Expand All'}
            </button>
          )}
        </div>
      </div>

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
        <SprintSummaryCard summary={sprintSummary} formatDate={formatDate} />
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
          {grouped.map(group => (
            <div key={group.label}>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{group.label}</h3>
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400">
                      <th className="text-left px-3 py-2 font-medium" style={{ width: '40%' }}>Rib Item</th>
                      <th className="text-center px-2 py-2 font-medium w-12">Size</th>
                      <th className="text-center px-2 py-2 font-medium w-12">Pts</th>
                      {showTargetCol && <th className="text-center px-2 py-2 font-medium w-14">Target</th>}
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
                        getSprintPct={getSprintPct}
                        getCurrentPct={getCurrentPct}
                        getDelta={getDelta}
                        getCommentCount={getCommentCount}
                        getCommentHistory={getCommentHistory}
                        updateProgress={updateProgress}
                        removeProgress={removeProgress}
                        updateComment={updateComment}
                        formatDate={formatDate}
                        sizeMapping={product.sizeMapping}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}



