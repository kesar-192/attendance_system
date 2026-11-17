import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { THRESHOLD, formatDate } from '../utils/format';

const AXIS = { fontSize: 12, fill: '#5B6678' };

export function TrendChart({ data, height = 240 }) {
  if (!data || data.length === 0) return <p className="py-10 text-center text-sm text-muted">No attendance has been marked in this period.</p>;
  return (
    <div style={{ height }} aria-label="Attendance trend chart" role="img">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="#DDE2EA" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d) => formatDate(d).slice(0, 6)} tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} unit="%" />
          <Tooltip labelFormatter={formatDate} formatter={(v) => [`${v}%`, 'Attendance']} />
          <ReferenceLine y={THRESHOLD} stroke="#B42318" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="percentage" stroke="#0E7C7B" strokeWidth={2.5} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarsChart({ data, xKey, yKey, unit = '', threshold, color = '#13294B', height = 240, label }) {
  if (!data || data.length === 0) return <p className="py-10 text-center text-sm text-muted">Nothing to chart yet.</p>;
  return (
    <div style={{ height }} aria-label={label} role="img">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="#DDE2EA" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} interval={0} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} unit={unit} domain={threshold ? [0, 100] : undefined} allowDecimals={false} />
          <Tooltip formatter={(v) => [`${v}${unit}`, label]} cursor={{ fill: '#F4F6F9' }} />
          {threshold && <ReferenceLine y={threshold} stroke="#B42318" strokeDasharray="4 4" />}
          <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
