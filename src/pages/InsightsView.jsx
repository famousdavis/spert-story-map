import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  getTotalProjectPoints, getCoreNonCorePoints, getProjectPercentComplete,
  getPointsForRelease, getReleasePercentComplete, getCoreNonCorePointsForRelease,
  getSizingDistribution, getAllRibItems, getProgressOverTime, getReleaseProgressOverTime,
  getRibItemPoints, getAllocationTotal,
} from '../lib/calculations';
import ProgressBar from '../components/ui/ProgressBar';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, ComposedChart, Line,
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function InsightsView() {
  const { product } = useOutletContext();

  const totalPoints = useMemo(() => getTotalProjectPoints(product), [product]);
  const { core, nonCore } = useMemo(() => getCoreNonCorePoints(product), [product]);
  const projectPct = useMemo(() => getProjectPercentComplete(product), [product]);
  const allRibs = useMemo(() => getAllRibItems(product), [product]);
  const sizingDist = useMemo(() => getSizingDistribution(product), [product]);
  const progressData = useMemo(() => getProgressOverTime(product), [product]);

  const unsizedItems = allRibs.filter(r => !r.size);
  const unassignedItems = allRibs.filter(r => r.releaseAllocations.length === 0);
  const partialAllocItems = allRibs.filter(r => {
    const total = getAllocationTotal(r);
    return total > 0 && total !== 100;
  });

  // Release breakdown
  const releaseData = useMemo(() =>
    product.releases.map(r => {
      const pts = Math.round(getPointsForRelease(product, r.id));
      const pct = getReleasePercentComplete(product, r.id);
      const { core, nonCore } = getCoreNonCorePointsForRelease(product, r.id);
      return { name: r.name, points: pts, complete: Math.round(pct), remaining: pts - Math.round(pts * pct / 100), core: Math.round(core), nonCore: Math.round(nonCore) };
    }), [product]);

  // Core/Non-core pie data
  const coreNonCoreData = [
    { name: 'Core', value: core },
    { name: 'Non-core', value: nonCore },
  ].filter(d => d.value > 0);

  // Sizing distribution bar data
  const sizingData = Object.entries(sizingDist).map(([label, count]) => ({ label, count }));

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Insights</h2>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard label="Total Points" value={totalPoints} />
        <StatCard label="Core Points" value={core} accent="text-blue-600" />
        <StatCard label="Non-core Points" value={nonCore} accent="text-gray-500" />
        <StatCard label="Rib Items" value={allRibs.length} />
        <StatCard label="% Complete" value={`${Math.round(projectPct)}%`} accent={projectPct > 50 ? 'text-green-600' : 'text-amber-600'} />
      </div>

      {/* Project progress */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Project Progress</h3>
        <ProgressBar percent={projectPct} showLabel height="h-4" color="bg-blue-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Core vs Non-core */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Core vs Non-core</h3>
          {coreNonCoreData.length > 0 ? (
            <div className="flex items-center justify-center gap-6">
              {/* Left label - Core */}
              <div className="flex-shrink-0 text-right w-28">
                <div className="flex items-center justify-end gap-2">
                  <span className="text-sm font-medium text-gray-700">Core</span>
                  <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
                </div>
                <div className="text-lg font-bold text-blue-600 tabular-nums">{core} pts</div>
                <div className="text-xs text-gray-400">{totalPoints > 0 ? Math.round(core / totalPoints * 100) : 0}%</div>
              </div>

              {/* Pie chart */}
              <div className="flex-shrink-0" style={{ width: 160, height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={coreNonCoreData} cx="50%" cy="50%" outerRadius={70} innerRadius={0} dataKey="value" label={false} isAnimationActive={false}>
                      <Cell fill="#3b82f6" />
                      <Cell fill="#d1d5db" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Right label - Non-core */}
              <div className="flex-shrink-0 text-left w-28">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-gray-300 inline-block" />
                  <span className="text-sm font-medium text-gray-700">Non-core</span>
                </div>
                <div className="text-lg font-bold text-gray-500 tabular-nums">{nonCore} pts</div>
                <div className="text-xs text-gray-400">{totalPoints > 0 ? Math.round(nonCore / totalPoints * 100) : 0}%</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">No sized items yet</p>
          )}
        </div>

        {/* Sizing Distribution */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Sizing Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sizingData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Release breakdown */}
      {releaseData.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Release Breakdown</h3>
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={releaseData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="core" stackId="a" fill="#3b82f6" name="Core Points" radius={[0, 0, 0, 0]} />
              <Bar yAxisId="left" dataKey="nonCore" stackId="a" fill="#d1d5db" name="Non-core Points" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="complete" stroke="#10b981" strokeWidth={2} name="% Complete" dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Release table */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left py-2 font-medium">Release</th>
                  <th className="text-right py-2 font-medium">Total Pts</th>
                  <th className="text-right py-2 font-medium">Core</th>
                  <th className="text-right py-2 font-medium">Non-core</th>
                  <th className="text-right py-2 font-medium">% Complete</th>
                  <th className="text-right py-2 font-medium">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {releaseData.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 font-medium text-gray-700">{r.name}</td>
                    <td className="py-2 text-right tabular-nums">{r.points}</td>
                    <td className="py-2 text-right text-blue-600 tabular-nums">{r.core}</td>
                    <td className="py-2 text-right text-gray-400 tabular-nums">{r.nonCore}</td>
                    <td className="py-2 text-right tabular-nums">{r.complete}%</td>
                    <td className="py-2 text-right tabular-nums">{r.remaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Progress over time */}
      {progressData.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Burn-up Chart</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={progressData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="sprintName" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="totalPoints" stroke="#e5e7eb" fill="#f9fafb" name="Total Scope" />
              <Area type="monotone" dataKey="completedPoints" stroke="#3b82f6" fill="#93c5fd" name="Completed" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Attention items */}
      {(unsizedItems.length > 0 || unassignedItems.length > 0 || partialAllocItems.length > 0) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Needs Attention</h3>
          <div className="space-y-4">
            {unsizedItems.length > 0 && (
              <AttentionSection
                title={`${unsizedItems.length} unsized items`}
                color="text-amber-600"
                items={unsizedItems.map(r => `${r.name} (${r.backboneName})`)}
              />
            )}
            {unassignedItems.length > 0 && (
              <AttentionSection
                title={`${unassignedItems.length} unassigned items`}
                color="text-orange-600"
                items={unassignedItems.map(r => `${r.name} (${r.backboneName})`)}
              />
            )}
            {partialAllocItems.length > 0 && (
              <AttentionSection
                title={`${partialAllocItems.length} items with incomplete allocations`}
                color="text-red-600"
                items={partialAllocItems.map(r => `${r.name} — ${getAllocationTotal(r)}%`)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent = '' }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${accent || 'text-gray-900'}`}>{value}</div>
    </div>
  );
}

function AttentionSection({ title, color, items }) {
  return (
    <div>
      <h4 className={`text-sm font-medium ${color} mb-1`}>{title}</h4>
      <ul className="text-xs text-gray-500 space-y-0.5 ml-4 list-disc">
        {items.slice(0, 10).map((item, i) => <li key={i}>{item}</li>)}
        {items.length > 10 && <li className="italic">...and {items.length - 10} more</li>}
      </ul>
    </div>
  );
}
