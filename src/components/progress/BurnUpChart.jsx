import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useDarkMode } from '../../hooks/useDarkMode';

export default function BurnUpChart({ data }) {
  const { isDark } = useDarkMode();

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#f0f0f0'} />
          <XAxis dataKey="sprintName" tick={{ fontSize: 11, fill: isDark ? '#9ca3af' : '#6b7280' }} stroke={isDark ? '#4b5563' : '#e5e7eb'} />
          <YAxis tick={{ fontSize: 11, fill: isDark ? '#9ca3af' : '#6b7280' }} stroke={isDark ? '#4b5563' : '#e5e7eb'} />
          <Tooltip contentStyle={isDark ? { backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f3f4f6' } : undefined} />
          <Area type="monotone" dataKey="completedPoints" stackId="1" stroke="#3b82f6" fill={isDark ? '#1e40af' : '#93c5fd'} name="Completed" />
          <Area type="monotone" dataKey="totalPoints" stackId="2" stroke={isDark ? '#4b5563' : '#e5e7eb'} fill={isDark ? '#374151' : '#f3f4f6'} name="Total Scope" fillOpacity={0} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
