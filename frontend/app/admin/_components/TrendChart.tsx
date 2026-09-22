'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { formatCompact } from '../../_lib/format';

export interface TrendPoint {
  date: string; // ISO date
  value: number;
}

function formatTick(iso: string, bucket: 'day' | 'week' | 'month') {
  const d = new Date(iso);
  if (bucket === 'month') return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface TrendTooltipProps {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  bucket: 'day' | 'week' | 'month';
  valueLabel?: string;
}

function TrendTooltip({ active, payload, label, bucket, valueLabel }: TrendTooltipProps) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs"
      style={{ border: '1px solid rgba(200,155,60,0.20)', background: 'var(--bg2)', color: 'var(--text)' }}
    >
      <div className="font-semibold" style={{ color: 'var(--gold-bright)' }}>
        {formatCompact(payload[0].value)}{valueLabel ? ` ${valueLabel}` : ''}
      </div>
      <div className="mt-0.5 text-zinc-400">{formatTick(label, bucket)}</div>
    </div>
  );
}

/**
 * Single-series trend (signups or completions over time). One hue, area at ~10% opacity
 * (marks-and-anatomy.md), crosshair tooltip that snaps to the nearest bucket (interaction.md),
 * hairline solid gridlines. Value at the end is carried by the tooltip + the stat tile above
 * it rather than a permanent on-chart label, since every bucket is already visible on hover.
 */
export default function TrendChart({
  data,
  bucket,
  valueLabel,
}: {
  data: TrendPoint[];
  bucket: 'day' | 'week' | 'month';
  valueLabel?: string;
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-600">No data in this range</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="gdt-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e8c86a" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#e8c86a" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="rgba(200,155,60,0.10)" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#4a3d2a', fontSize: 11 }}
          axisLine={{ stroke: 'rgba(200,155,60,0.15)' }}
          tickLine={false}
          tickFormatter={(v: string) => formatTick(v, bucket)}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: '#4a3d2a', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={40}
          tickFormatter={formatCompact}
          allowDecimals={false}
        />
        <Tooltip
          content={<TrendTooltip bucket={bucket} valueLabel={valueLabel} />}
          cursor={{ stroke: 'rgba(200,155,60,0.35)', strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#e8c86a"
          strokeWidth={2}
          fill="url(#gdt-trend-fill)"
          dot={false}
          activeDot={{ r: 4, fill: '#e8c86a', stroke: 'var(--bg2)', strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
