import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function BurnUpChart({ data }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="sprintName" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Area type="monotone" dataKey="completedPoints" stackId="1" stroke="#3b82f6" fill="#93c5fd" name="Completed" />
          <Area type="monotone" dataKey="totalPoints" stackId="2" stroke="#e5e7eb" fill="#f3f4f6" name="Total Scope" fillOpacity={0} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
