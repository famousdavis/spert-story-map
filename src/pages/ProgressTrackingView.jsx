import { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getAllRibItems, getRibItemPoints, getRibItemPercentComplete, getReleasePercentComplete, getProjectPercentComplete, getProgressOverTime } from '../lib/calculations';
import ProgressBar from '../components/ui/ProgressBar';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function ProgressTrackingView() {
  const { product, updateProduct } = useOutletContext();
  const [selectedSprint, setSelectedSprint] = useState(
    product.sprints.length > 0 ? product.sprints[product.sprints.length - 1].id : null
  );
  const [groupBy, setGroupBy] = useState('release'); // 'release' | 'backbone' | 'theme'

  const allRibs = useMemo(() => getAllRibItems(product), [product]);
  const assignedRibs = useMemo(() => allRibs.filter(r => r.releaseAllocations.length > 0), [allRibs]);
  const projectPct = useMemo(() => getProjectPercentComplete(product, selectedSprint), [product, selectedSprint]);
  const progressData = useMemo(() => getProgressOverTime(product), [product]);

  const sprint = product.sprints.find(s => s.id === selectedSprint);
  const prevSprint = sprint ? product.sprints.find(s => s.order === sprint.order - 1) : null;

  const updateProgress = (ribId, percentComplete) => {
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
            const existingIdx = history.findIndex(p => p.sprintId === selectedSprint);
            if (existingIdx >= 0) {
              history[existingIdx] = { ...history[existingIdx], percentComplete };
            } else {
              history.push({ sprintId: selectedSprint, percentComplete });
            }
            return { ...r, progressHistory: history };
          }),
        })),
      })),
    }));
  };

  // Group rib items
  const grouped = useMemo(() => {
    const groups = {};
    for (const rib of assignedRibs) {
      let key, label;
      if (groupBy === 'release') {
        // Group by primary release (first allocation)
        const releaseId = rib.releaseAllocations[0]?.releaseId;
        const release = product.releases.find(r => r.id === releaseId);
        key = releaseId || 'unassigned';
        label = release?.name || 'Unassigned';
      } else if (groupBy === 'backbone') {
        key = rib.backboneId;
        label = rib.backboneName;
      } else {
        key = rib.themeId;
        label = rib.themeName;
      }
      if (!groups[key]) groups[key] = { label, items: [] };
      groups[key].items.push(rib);
    }
    return Object.values(groups);
  }, [assignedRibs, groupBy, product.releases]);

  const getProgressForSprint = (rib, sprintId) => {
    const entry = rib.progressHistory?.find(p => p.sprintId === sprintId);
    return entry ? entry.percentComplete : null;
  };

  const getDelta = (rib) => {
    if (!sprint || !prevSprint) return null;
    const current = getProgressForSprint(rib, sprint.id);
    const prev = getProgressForSprint(rib, prevSprint.id);
    if (current === null) return null;
    return current - (prev || 0);
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
                      <th className="text-left px-4 py-2 font-medium">Rib Item</th>
                      <th className="text-center px-3 py-2 font-medium w-16">Size</th>
                      <th className="text-center px-3 py-2 font-medium w-16">Pts</th>
                      <th className="text-center px-3 py-2 font-medium w-24">Current %</th>
                      <th className="text-center px-3 py-2 font-medium w-28">
                        {sprint?.name || 'Sprint'} %
                      </th>
                      {prevSprint && <th className="text-center px-3 py-2 font-medium w-16">Delta</th>}
                      <th className="px-3 py-2 font-medium w-32">Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {group.items.map(rib => {
                      const pts = getRibItemPoints(rib, product.sizeMapping);
                      const currentPct = getRibItemPercentComplete(rib);
                      const sprintPct = selectedSprint ? getProgressForSprint(rib, selectedSprint) : null;
                      const delta = getDelta(rib);

                      return (
                        <tr key={rib.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2">
                            <div className="text-sm text-gray-800">{rib.name}</div>
                            <div className="text-xs text-gray-400">{rib.backboneName}</div>
                          </td>
                          <td className="text-center px-3 py-2">
                            <span className="text-xs text-gray-500">{rib.size || '—'}</span>
                          </td>
                          <td className="text-center px-3 py-2">
                            <span className="text-xs text-gray-500 tabular-nums">{pts || '—'}</span>
                          </td>
                          <td className="text-center px-3 py-2">
                            <span className="text-sm font-medium text-gray-700 tabular-nums">{currentPct}%</span>
                          </td>
                          <td className="text-center px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={sprintPct ?? ''}
                              placeholder="—"
                              onChange={e => {
                                const raw = e.target.value;
                                if (raw === '') {
                                  updateProgress(rib.id, 0);
                                  return;
                                }
                                const val = parseInt(raw);
                                if (!isNaN(val) && val >= 0 && val <= 100) {
                                  updateProgress(rib.id, val);
                                }
                              }}
                              className="w-16 border border-gray-200 rounded px-2 py-1 text-sm text-center focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                            />
                          </td>
                          {prevSprint && (
                            <td className="text-center px-3 py-2">
                              {delta !== null ? (
                                <span className={`text-xs font-medium tabular-nums ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                  {delta > 0 ? '+' : ''}{delta}%
                                </span>
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </td>
                          )}
                          <td className="px-3 py-2">
                            <ProgressBar percent={currentPct} height="h-1.5" />
                          </td>
                        </tr>
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
