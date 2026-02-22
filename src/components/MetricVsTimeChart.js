import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function MetricVsTimeChart({ data, metric, onEnlarge }) {
  const [enlarged, setEnlarged] = useState(false);

  if (!data?.length) return null;

  const handleClick = () => {
    if (onEnlarge) onEnlarge();
    else setEnlarged(!enlarged);
  };

  const handleDownload = (e) => {
    e.stopPropagation();
    const headers = ['date', 'value'];
    const headerRow = headers.join(',');
    const rows = data.map((row) => [row.date, row.value].join(','));
    const csv = [headerRow, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metric-vs-time-${metric}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const chart = (
    <div className={`metric-vs-time-chart ${enlarged ? 'enlarged' : ''}`} onClick={handleClick}>
      {enlarged && (
        <div className="metric-chart-actions">
          <button type="button" onClick={handleDownload}>Download</button>
          <button type="button" onClick={() => setEnlarged(false)}>Close</button>
        </div>
      )}
      <p className="metric-chart-label">{metric} vs time</p>
      <ResponsiveContainer width="100%" height={enlarged ? 520 : 380} minHeight={enlarged ? 480 : 340}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 32 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={55}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(15,15,35,0.95)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              color: '#e2e8f0',
            }}
            formatter={(val) => [val?.toLocaleString?.() ?? val, metric]}
          />
          <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  return chart;
}
