import { useState, useMemo, useEffect, Fragment } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  getAllRibItems, getRibItemPoints, getRibItemPercentComplete,
  getReleasePercentComplete, getProjectPercentComplete, getProgressOverTime,
  getRibReleaseProgressForSprint, getRibReleaseProgress,
} from '../lib/calculations';
import ProgressBar from '../components/ui/ProgressBar';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function ProgressTrackingView() {
  const { product, updateProduct } = useOutletContext();
  const [selectedSprint, setSelectedSprint] = useState(
    product.sprints.length > 0 ? product.sprints[product.sprints.length - 1].id : null
  );
  const [groupBy, setGroupBy] = useState('release');
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [commentDrafts, setCommentDrafts] = useState({});

  // Collapse and clear drafts when sprint changes
  useEffect(() => {
    setExpandedRows(new Set());
    setCommentDrafts({});
  }, [selectedSprint]);

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
  const projectPct = useMemo(() => getProjectPercentComplete(product, selectedSprint), [product, selectedSprint]);
  const progressData = useMemo(() => getProgressOverTime(product), [product]);

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

  // Write a per-release progress entry
  const updateProgress = (ribId, releaseId, percentComplete) => {
    if (!selectedSprint) return;
    updateProduct(prev => ({
      ...prev,
      themes: prev.themes.map(t => ({
        ...t,
        backboneItems: t.backboneItems.map(b => ({
          ...b,
          ribItems: b.ribItems.map(r => {
            if (r.id !== ribId) return r;
            const history = [...(r.progressHistory || [])];
            const existingIdx = history.findIndex(
              p => p.sprintId === selectedSprint && p.releaseId === releaseId
            );
            const now = new Date().toISOString();
            if (existingIdx >= 0) {
              history[existingIdx] = { ...history[existingIdx], percentComplete, updatedAt: now };
            } else {
              history.push({ sprintId: selectedSprint, releaseId, percentComplete, comment: '', updatedAt: now });
            }
            return { ...r, progressHistory: history };
          }),
        })),
      })),
    }));
  };

  // Remove a progress entry (clear input). Preserves entry if it has a comment.
  const removeProgress = (ribId, releaseId) => {
    if (!selectedSprint) return;
    updateProduct(prev => ({
      ...prev,
      themes: prev.themes.map(t => ({
        ...t,
        backboneItems: t.backboneItems.map(b => ({
          ...b,
          ribItems: b.ribItems.map(r => {
            if (r.id !== ribId) return r;
            const history = [...(r.progressHistory || [])];
            const existingIdx = history.findIndex(
              p => p.sprintId === selectedSprint && p.releaseId === releaseId
            );
            if (existingIdx < 0) return r;
            if (history[existingIdx].comment) {
              // Keep the entry for the comment, just zero the progress
              history[existingIdx] = { ...history[existingIdx], percentComplete: 0, updatedAt: new Date().toISOString() };
            } else {
              // No comment — remove the entry entirely
              history.splice(existingIdx, 1);
            }
            return { ...r, progressHistory: history };
          }),
        })),
      })),
    }));
  };

  // Write a comment to a progress entry
  const updateComment = (ribId, releaseId, comment) => {
    if (!selectedSprint) return;
    updateProduct(prev => ({
      ...prev,
      themes: prev.themes.map(t => ({
        ...t,
        backboneItems: t.backboneItems.map(b => ({
          ...b,
          ribItems: b.ribItems.map(r => {
            if (r.id !== ribId) return r;
            const history = [...(r.progressHistory || [])];
            const existingIdx = history.findIndex(
              p => p.sprintId === selectedSprint && p.releaseId === releaseId
            );
            const now = new Date().toISOString();
            if (existingIdx >= 0) {
              history[existingIdx] = { ...history[existingIdx], comment, updatedAt: now };
            } else {
              history.push({ sprintId: selectedSprint, releaseId, percentComplete: 0, comment, updatedAt: now });
            }
            return { ...r, progressHistory: history };
          }),
        })),
      })),
    }));
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
      // Sort items within each release group by backbone → rib name
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
    // Sort items within each group by rib name
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
    const entries = rib.progressHistory?.filter(p => p.sprintId === selectedSprint) || [];
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
      const entries = rib.progressHistory?.filter(p => p.sprintId === prevSprint.id) || [];
      prev = entries.length > 0 ? entries.reduce((s, e) => s + e.percentComplete, 0) : null;
    }
    return current - (prev || 0);
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return ''; }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-900">Progress Tracking</h2>
          <div className="text-xs text-gray-500">
            Project: <span className="font-medium text-gray-700">{Math.round(projectPct)}%</span> complete
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Sprint:</span>
            <select
              value={selectedSprint || ''}
              onChange={e => setSelectedSprint(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
            >
              {product.sprints.length === 0 && <option value="">No sprints defined</option>}
              {product.sprints.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Group:</span>
            {['release', 'backbone', 'theme'].map(g => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`px-2 py-1 text-xs rounded ${groupBy === g ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                {g.charAt(0).toUpperCase() + g.slice(1)}
              </button>
            ))}
          </div>
          {assignedRibs.length > 0 && (
            <button
              onClick={toggleExpandAll}
              className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-500 hover:bg-gray-200"
              title={allExpanded ? 'Collapse all notes' : 'Expand all notes'}
            >
              {allExpanded ? 'Collapse All' : 'Expand All'}
            </button>
          )}
        </div>
      </div>

      {/* Project progress bar */}
      <div className="mb-6">
        <ProgressBar percent={projectPct} showLabel height="h-3" />
      </div>

      {/* Release progress bars */}
      {product.releases.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 mb-8 space-y-3">
          {product.releases.map(release => {
            const pct = getReleasePercentComplete(product, release.id, selectedSprint);
            return (
              <div key={release.id} className="flex items-center gap-4">
                <span className="text-xs font-medium text-gray-700 w-40 truncate flex-shrink-0">{release.name}</span>
                <div className="flex-1">
                  <ProgressBar percent={pct} height="h-2" />
                </div>
                <span className="text-xs text-gray-500 tabular-nums w-10 text-right flex-shrink-0">{Math.round(pct)}%</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Burn-up chart */}
      {progressData.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-8">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Progress Over Time</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={progressData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="sprintName" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="completedPoints" stackId="1" stroke="#3b82f6" fill="#93c5fd" name="Completed" />
              <Area type="monotone" dataKey="totalPoints" stackId="2" stroke="#e5e7eb" fill="#f3f4f6" name="Total Scope" fillOpacity={0} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Rib item progress table */}
      {product.sprints.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>No sprints defined. Add sprints in Settings to start tracking progress.</p>
        </div>
      ) : assignedRibs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>No rib items assigned to releases yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.label}>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">{group.label}</h3>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500">
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
                  <tbody className="divide-y divide-gray-50">
                    {group.items.map((rib, idx) => {
                      const rowKey = `${rib.id}-${rib._releaseId || idx}`;
                      const isExpanded = expandedRows.has(rowKey);
                      const pts = getRibItemPoints(rib, product.sizeMapping);
                      const currentPct = getCurrentPct(rib, rib._releaseId);
                      const sprintPct = getSprintPct(rib, rib._releaseId);
                      const delta = getDelta(rib, rib._releaseId);
                      const maxPct = rib._allocPct || 100;
                      const progressBarPct = rib._allocPct
                        ? (rib._allocPct > 0 ? (currentPct / rib._allocPct) * 100 : 0)
                        : currentPct;
                      const commentCount = getCommentCount(rib, rib._releaseId);

                      // Get current sprint's comment for this rib+release
                      const currentEntry = rib.progressHistory?.find(
                        p => p.sprintId === selectedSprint && (rib._releaseId ? p.releaseId === rib._releaseId : true)
                      );
                      const savedComment = currentEntry?.comment || '';

                      // Initialize draft when expanding
                      if (isExpanded && commentDrafts[rowKey] === undefined && savedComment) {
                        // Use setTimeout to avoid setState during render
                        setTimeout(() => setCommentDrafts(prev => prev[rowKey] === undefined ? { ...prev, [rowKey]: savedComment } : prev), 0);
                      }

                      return (
                        <Fragment key={rowKey}>
                          <tr className={`hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-blue-50/30' : ''}`}>
                            <td
                              className="px-3 py-2 cursor-pointer select-none"
                              onClick={() => toggleRow(rowKey)}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className={`text-gray-400 text-[10px] transition-transform duration-150 flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm text-gray-800 truncate">{rib.name}</span>
                                    {commentCount > 0 && (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400 flex-shrink-0" title={`${commentCount} note${commentCount > 1 ? 's' : ''}`}>
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                        </svg>
                                        {commentCount}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-400 truncate">{rib.backboneName}</div>
                                </div>
                              </div>
                            </td>
                            <td className="text-center px-2 py-2">
                              <span className="text-xs text-gray-500">{rib.size || '—'}</span>
                            </td>
                            <td className="text-center px-2 py-2">
                              <span className="text-xs text-gray-500 tabular-nums">
                                {pts ? (rib._allocPct ? Math.round(pts * rib._allocPct / 100) : pts) : '—'}
                              </span>
                            </td>
                            {showTargetCol && (
                              <td className="text-center px-2 py-2">
                                <span className="text-xs text-gray-500 tabular-nums">{rib._allocPct}%</span>
                              </td>
                            )}
                            <td className="text-center px-2 py-2">
                              <span className="text-sm font-medium text-gray-700 tabular-nums">{currentPct}%</span>
                            </td>
                            <td className="text-center px-2 py-2">
                              {rib._editable ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={maxPct}
                                  value={sprintPct ?? ''}
                                  placeholder="—"
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => {
                                    const raw = e.target.value;
                                    if (raw === '') {
                                      removeProgress(rib.id, rib._releaseId);
                                      return;
                                    }
                                    const val = parseInt(raw);
                                    if (!isNaN(val) && val >= 0 && val <= maxPct) {
                                      updateProgress(rib.id, rib._releaseId, val);
                                    }
                                  }}
                                  className="w-14 border border-gray-200 rounded px-1 py-1 text-sm text-center focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                                />
                              ) : (
                                <span className="text-sm text-gray-500 tabular-nums">{sprintPct ?? '—'}%</span>
                              )}
                            </td>
                            {prevSprint && (
                              <td className="text-center px-2 py-2">
                                {delta !== null ? (
                                  <span className={`text-xs font-medium tabular-nums ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                    {delta > 0 ? '+' : ''}{delta}%
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-300">—</span>
                                )}
                              </td>
                            )}
                            <td className="px-2 py-2">
                              <ProgressBar percent={progressBarPct} height="h-1.5" />
                            </td>
                          </tr>

                          {/* Expandable comment row */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={totalCols} className="px-4 py-3 bg-gray-50/60 border-t border-gray-100">
                                <CommentPanel
                                  rib={rib}
                                  sprint={sprint}
                                  selectedSprint={selectedSprint}
                                  rowKey={rowKey}
                                  savedComment={savedComment}
                                  commentDrafts={commentDrafts}
                                  setCommentDrafts={setCommentDrafts}
                                  updateComment={updateComment}
                                  getCommentHistory={getCommentHistory}
                                  formatDate={formatDate}
                                  editable={rib._editable}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
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

function CommentPanel({ rib, sprint, selectedSprint, rowKey, savedComment, commentDrafts, setCommentDrafts, updateComment, getCommentHistory, formatDate, editable }) {
  const draft = commentDrafts[rowKey] ?? savedComment;
  const history = getCommentHistory(rib, rib._releaseId);
  // Exclude current sprint from history (it's shown in the input)
  const pastHistory = history.filter(h => h.sprintId !== selectedSprint);

  const handleBlur = () => {
    const value = commentDrafts[rowKey];
    if (value !== undefined && value !== savedComment) {
      updateComment(rib.id, rib._releaseId, value);
    }
  };

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.target.blur();
    }
  };

  return (
    <div className="max-w-xl space-y-3">
      {/* Current sprint comment input */}
      {editable ? (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {sprint?.name || 'Sprint'} assessment note
          </label>
          <textarea
            rows={2}
            value={draft}
            onChange={e => setCommentDrafts(prev => ({ ...prev, [rowKey]: e.target.value }))}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="Why did we assess this progress level?"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 placeholder:text-gray-300 focus:border-blue-300 focus:ring-1 focus:ring-blue-200 outline-none resize-y"
          />
        </div>
      ) : savedComment ? (
        <div>
          <span className="text-xs font-medium text-gray-500">{sprint?.name || 'Sprint'} note:</span>
          <p className="text-sm text-gray-600 mt-0.5">{savedComment}</p>
        </div>
      ) : null}

      {/* Comment history */}
      {pastHistory.length > 0 ? (
        <div className="space-y-2">
          <span className="text-xs font-medium text-gray-400">Prior notes</span>
          {pastHistory.map(entry => (
            <div key={`${entry.sprintId}-${entry.releaseId}`} className="border-l-2 border-gray-200 pl-3">
              <div className="text-xs text-gray-400">
                {entry.sprintName}
                {entry.updatedAt && <span> · {formatDate(entry.updatedAt)}</span>}
                <span> · {entry.percentComplete}%</span>
              </div>
              <div className="text-sm text-gray-600">{entry.comment}</div>
            </div>
          ))}
        </div>
      ) : !editable && !savedComment ? (
        <p className="text-xs text-gray-300 italic">No assessment notes yet.</p>
      ) : null}
    </div>
  );
}
