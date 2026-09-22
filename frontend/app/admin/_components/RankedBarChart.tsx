'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import type { LabelListProps } from 'recharts';
import { formatCompact } from '../../_lib/format';

// Recharts' declared types for LabelList's `content`/`formatter` render props (Label's own
// SVG-text Props) don't line up with what it actually passes at runtime for a Bar's
// LabelList (x/y/width/height/value/index off the bar's own box) — a known rough edge of
// this library, not a design choice here. We declare the narrow shape we actually consume
// and cross to Recharts' prop type through `unknown` (never `any`) at the two call sites.
interface TopLabelProps {
  x?: string | number;
  y?: string | number;
  width?: string | number;
  height?: string | number;
  value?: string | number | boolean | null;
  index?: number;
}

export interface RankedBarDatum {
  label: string;
  value: number;
  sublabel?: string;
}

// Single gold gradient reused across every ranked-bar instance — one <svg> id is fine since
// only one of these renders per gradient def at a time, but we still scope it per chart to
// avoid any collision if two ever share a page.
let gradientSeq = 0;

function TopLabel({ x = 0, y = 0, width = 0, height = 0, value, index }: TopLabelProps) {
  // "Label selectively — never a number on every point" (dataviz skill): only the top
  // (extreme) bar gets a direct value label; the rest lean on the axis + hover tooltip,
  // and every value is still reachable via the "View as table" twin.
  if (index !== 0) return null;
  const nx = Number(x), ny = Number(y), nw = Number(width), nh = Number(height);
  return (
    <text x={nx + nw + 6} y={ny + nh / 2} dy={4} fontSize={11} fill="#9a8570" textAnchor="start">
      {formatCompact(Number(value ?? 0))}
    </text>
  );
}

interface RankedTooltipProps {
  active?: boolean;
  payload?: { payload: RankedBarDatum; value: number }[];
  valueLabel?: string;
}

function RankedTooltip({ active, payload, valueLabel }: RankedTooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs"
      style={{ border: '1px solid rgba(200,155,60,0.20)', background: 'var(--bg2)', color: 'var(--text)' }}
    >
      <div className="font-semibold" style={{ color: 'var(--gold-bright)' }}>{formatCompact(p.value)}{valueLabel ? ` ${valueLabel}` : ''}</div>
      <div className="mt-0.5 text-zinc-400">{p.label}</div>
      {p.sublabel && <div className="text-zinc-600">{p.sublabel}</div>}
    </div>
  );
}

/**
 * Horizontal ranked bar chart — every use in this panel (top games, top streaks, region
 * popularity, timezone breakdown) is a single-series magnitude comparison, so per the
 * dataviz color-formula every bar takes the same slot-1 gold, never one hue per bar
 * (a rainbow on nominal categories is an explicit anti-pattern). Pass `barColors` only for
 * an ordinal series (role tiers), where lightness *is* meant to carry the tier order.
 */
export default function RankedBarChart({
  data,
  valueLabel,
  barColors,
  labelMode = 'top',
}: {
  data: RankedBarDatum[];
  valueLabel?: string;
  barColors?: string[];
  labelMode?: 'top' | 'all';
}) {
  const gradientId = `gdt-gold-bar-${(gradientSeq++).toString(36)}`;
  const rowHeight = 34;
  const height = Math.max(120, data.length * rowHeight) + 24; // + room for the x-axis band

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-600">No data yet</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 4, bottom: 4 }} barCategoryGap={10}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#c8913c" />
            <stop offset="100%" stopColor="#e8c86a" />
          </linearGradient>
        </defs>
        <CartesianGrid horizontal={false} stroke="rgba(200,155,60,0.10)" />
        <XAxis
          type="number"
          tick={{ fill: '#4a3d2a', fontSize: 11 }}
          axisLine={{ stroke: 'rgba(200,155,60,0.15)' }}
          tickLine={false}
          tickFormatter={formatCompact}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={128}
          tick={{ fill: '#f0ede8', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<RankedTooltip valueLabel={valueLabel} />} cursor={{ fill: 'rgba(200,155,60,0.06)' }} />
        <Bar dataKey="value" fill={`url(#${gradientId})`} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
          {barColors && data.map((_, i) => <Cell key={i} fill={barColors[i % barColors.length]} />)}
          <LabelList
            dataKey="value"
            content={labelMode === 'all' ? undefined : (TopLabel as unknown as LabelListProps['content'])}
            position={labelMode === 'all' ? 'right' : undefined}
            formatter={labelMode === 'all' ? (((v: string | number | boolean | null | undefined) => formatCompact(Number(v ?? 0))) as unknown as LabelListProps['formatter']) : undefined}
            fill="#9a8570"
            fontSize={11}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
