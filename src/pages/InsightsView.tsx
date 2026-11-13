// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  getTotalProjectPoints, getCoreNonCorePoints, getProjectPercentComplete,
  getPointsForRelease, getReleasePercentComplete, getCoreNonCorePointsForRelease,
  getSizingDistribution, getAllRibItems, getProgressOverTime, round1,
} from '../lib/calculations';
import NeedsAttention from '../components/insights/NeedsAttention';
import ReleaseBreakdownTable from '../components/insights/ReleaseBreakdownTable';
import ProgressBar from '../components/ui/ProgressBar';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, ComposedChart, Line,
} from 'recharts';
import { useDarkMode } from '../hooks/useDarkMode';
import type { OutletContextValue } from '../types';


export default function InsightsView() {
  const { product, updateProduct } = useOutletContext<OutletContextValue>();
  const { isDark } = useDarkMode();

  const totalPoints = useMemo(() => getTotalProjectPoints(product), [product]);
  const { core, nonCore } = useMemo(() => getCoreNonCorePoints(product), [product]);
  const projectPct = useMemo(() => getProjectPercentComplete(product), [product]);
  const allRibs = useMemo(() => getAllRibItems(product), [product]);
  const sizingDist = useMemo(() => getSizingDistribution(product), [product]);
  const progressData = useMemo(() => getProgressOverTime(product), [product]);

  // Release breakdown: the chart. The table below it reads unrounded figures.
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

  // Chart color helpers
  const gridStroke = isDark ? '#374151' : '#f0f0f0';
  const axisStroke = isDark ? '#4b5563' : '#e5e7eb';
  const tickFill = isDark ? '#9ca3af' : '#6b7280';
  const tickStyle = { fontSize: 11, fill: tickFill };
  const tooltipStyle = isDark ? { backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f3f4f6' } : undefined;
  const nonCoreFill = isDark ? '#4b5563' : '#d1d5db';
  const scopeStroke = isDark ? '#4b5563' : '#e5e7eb';
  const scopeFill = isDark ? '#374151' : '#f9fafb';
  const completedFill = isDark ? '#1e40af' : '#93c5fd';

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">Insights</h2>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard label="Total Points" value={totalPoints} />
        <StatCard label="Core Points" value={core} accent="text-blue-600 dark:text-blue-400" />
        <StatCard label="Non-core Points" value={nonCore} accent="text-gray-500 dark:text-gray-400" />
        <StatCard label="Rib Items" value={allRibs.length} />
        <StatCard label="% Complete" value={`${round1(projectPct)}%`} accent={projectPct > 50 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'} />
      </div>

      {/* Project progress */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Overall Progress</h3>
        <ProgressBar percent={projectPct} showLabel height="h-4" color="bg-blue-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Core vs Non-core */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Core vs Non-core</h3>
          {coreNonCoreData.length > 0 ? (
            <div className="flex items-center justify-center gap-6">
              {/* Left label - Core */}
              <div className="flex-shrink-0 text-right w-28">
                <div className="flex items-center justify-end gap-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Core</span>
                  <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
                </div>
                <div className="text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums">{core} pts</div>
                <div className="text-xs text-gray-400 dark:text-gray-500">{totalPoints > 0 ? Math.round(core / totalPoints * 100) : 0}%</div>
              </div>

              {/* Pie chart — fixed pixel dimensions; ResponsiveContainer omitted to avoid
                  Recharts' width(-1)/height(-1) warning on initial measurement. */}
              <div className="flex-shrink-0">
                <PieChart width={160} height={160}>
                  <Pie data={coreNonCoreData} cx="50%" cy="50%" outerRadius={70} innerRadius={0} dataKey="value" label={false} isAnimationActive={false}>
                    <Cell fill="#3b82f6" />
                    <Cell fill={nonCoreFill} />
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </div>

              {/* Right label - Non-core */}
              <div className="flex-shrink-0 text-left w-28">
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full inline-block ${isDark ? 'bg-gray-500' : 'bg-gray-300'}`} />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Non-core</span>
                </div>
                <div className="text-lg font-bold text-gray-500 dark:text-gray-400 tabular-nums">{nonCore} pts</div>
                <div className="text-xs text-gray-400 dark:text-gray-500">{totalPoints > 0 ? Math.round(nonCore / totalPoints * 100) : 0}%</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No sized items yet</p>
          )}
        </div>

        {/* Sizing Distribution */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Sizing Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sizingData}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="label" tick={tickStyle} stroke={axisStroke} />
              <YAxis tick={tickStyle} allowDecimals={false} stroke={axisStroke} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Release breakdown */}
      {releaseData.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Release Breakdown</h3>
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={releaseData}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="name" tick={tickStyle} stroke={axisStroke} />
              <YAxis yAxisId="left" tick={tickStyle} stroke={axisStroke} />
              <YAxis yAxisId="right" orientation="right" tick={tickStyle} domain={[0, 100]} unit="%" stroke={axisStroke} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Bar yAxisId="left" dataKey="core" stackId="a" fill="#3b82f6" name="Core Points" radius={[0, 0, 0, 0]} />
              <Bar yAxisId="left" dataKey="nonCore" stackId="a" fill={nonCoreFill} name="Non-core Points" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="complete" stroke="#10b981" strokeWidth={2} name="% Complete" dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>

          <ReleaseBreakdownTable product={product} />
        </div>
      )}

      {/* Progress over time */}
      {progressData.length > 1 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Burn-up Chart</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={progressData}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="sprintName" tick={tickStyle} stroke={axisStroke} />
              <YAxis tick={tickStyle} stroke={axisStroke} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Area type="monotone" dataKey="totalPoints" stroke={scopeStroke} fill={scopeFill} name="Total Scope" />
              <Area type="monotone" dataKey="completedPoints" stroke="#3b82f6" fill={completedFill} name="Completed" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <NeedsAttention product={product} updateProduct={updateProduct} />
    </div>
  );
}

function StatCard({ label, value, accent = '' }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${accent || 'text-gray-900 dark:text-gray-100'}`}>{value}</div>
    </div>
  );
}
