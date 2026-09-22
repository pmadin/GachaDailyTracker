'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../_context/AuthContext';
import { fetchAdminAnalytics, type AnalyticsResponse, type AnalyticsRangeDays } from '../../_lib/api';
import { formatCompact } from '../../_lib/format';
import StatTile from '../_components/StatTile';
import ChartCard from '../_components/ChartCard';
import RankedBarChart, { type RankedBarDatum } from '../_components/RankedBarChart';
import TrendChart from '../_components/TrendChart';

// Same 3 tokens the site already defines in globals.css, plus one darker step computed to
// extend them into a 4-step ordinal ramp (validated: monotone lightness, adjacent ΔL >= 0.06,
// light-end contrast >= 2:1 against var(--bg2) — see the dataviz skill's --ordinal check).
const ROLE_RAMP = ['#5c4118', '#8a6020', '#c8913c', '#e8c86a'];

const RANGE_OPTIONS: { value: AnalyticsRangeDays; label: string }[] = [
  { value: '7', label: '7d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
  { value: '365', label: '1y' },
  { value: 'all', label: 'All time' },
];

function SimpleTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="max-h-72 overflow-auto rounded-lg" style={{ border: '1px solid rgba(200,155,60,0.10)' }}>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="sticky top-0 bg-[rgba(13,11,8,0.95)] text-[#4a3d2a]">
            {columns.map(c => <th key={c} className="px-3 py-2 font-medium">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-zinc-600">No data</td></tr>
          ) : rows.map((row, i) => (
            <tr key={i} className="border-t border-[rgba(200,155,60,0.06)]">
              {row.map((cell, j) => (
                <td key={j} className={`px-3 py-2 ${j === 0 ? 'text-zinc-200' : 'text-zinc-400'} ${typeof cell === 'number' ? 'tabular-nums' : ''}`}>
                  {typeof cell === 'number' ? cell.toLocaleString('en-US') : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const { token } = useAuth();
  const [range, setRange] = useState<AnalyticsRangeDays>('90');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (rangeArg: AnalyticsRangeDays) => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      setData(await fetchAdminAnalytics(token, rangeArg));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(range); }, [load, range]);

  if (error) {
    return <p className="rounded-lg bg-red-950 px-4 py-2 text-sm text-red-400">{error}</p>;
  }

  // Refetch keeps the previous render (at reduced opacity) instead of a skeleton flash —
  // interaction.md's "refetch keeps the frame" rule.
  const d = data;
  const dim = loading && d ? 'opacity-50 transition-opacity' : 'transition-opacity';

  const streakBars: RankedBarDatum[] = (d?.top_streaks ?? []).map(s => ({
    label: s.username,
    value: s.streak_count,
    sublabel: `${s.games_tracked} game${s.games_tracked === 1 ? '' : 's'} tracked`,
  }));
  const gameBars: RankedBarDatum[] = (d?.top_games ?? []).map(g => ({
    label: g.name,
    value: g.tracked_by,
    sublabel: g.server,
  }));
  const regionBars: RankedBarDatum[] = (d?.region_popularity ?? []).map(r => ({
    label: r.region,
    value: r.tracked_count,
    sublabel: `${r.game_count} game${r.game_count === 1 ? '' : 's'} in this region`,
  }));
  const countryBars: RankedBarDatum[] = (d?.timezone_breakdown ?? []).map(c => ({
    label: c.country,
    value: c.count,
  }));
  const roleBars: RankedBarDatum[] = (d?.role_distribution ?? []).map(r => ({
    label: r.role_name,
    value: r.count,
  }));

  const streakRate = d && d.summary.total_users > 0
    ? `${Math.round((d.summary.users_with_streak / d.summary.total_users) * 100)}% of users`
    : undefined;

  return (
    <div className={dim}>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Analytics</h1>
        <p className="text-sm text-zinc-500">
          Site-wide stats, pulled straight from the DB — no 30-day cap the way a free-tier
          traffic analytics plan would have.
        </p>
      </div>

      {/* KPI row — current state, not range-scoped */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Total users" value={d ? formatCompact(d.summary.total_users) : '—'} />
        <StatTile label="Active games" value={d ? formatCompact(d.summary.total_active_games) : '—'} />
        <StatTile label="Tracked games" value={d ? formatCompact(d.summary.total_tracked_rows) : '—'} sublabel="across all users" />
        <StatTile label="Completions" value={d ? formatCompact(d.summary.total_completions) : '—'} sublabel="all-time" />
        <StatTile label="On a streak" value={d ? formatCompact(d.summary.users_with_streak) : '—'} sublabel={streakRate} />
        <StatTile label="Avg games / user" value={d ? d.summary.avg_games_per_user.toFixed(1) : '—'} />
      </div>

      {/* Trend range — scopes the two charts directly below it only (interaction.md: one
          filter row, date range first, presets before custom). */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Trends</h2>
        <div className="flex overflow-hidden rounded-lg border border-[rgba(200,155,60,0.15)] text-xs">
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={`px-3 py-1.5 transition-colors ${
                range === opt.value ? 'bg-[rgba(200,155,60,0.15)] text-[#e8c86a]' : 'text-[#9a8570] hover:text-[#f0ede8]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="New signups"
          subtitle={d ? `Grouped by ${d.range.bucket}` : undefined}
          table={<SimpleTable columns={['Date', 'New', 'Cumulative']} rows={(d?.signups_over_time ?? []).map(p => [p.date.slice(0, 10), p.count, p.cumulative ?? ''])} />}
        >
          <TrendChart data={(d?.signups_over_time ?? []).map(p => ({ date: p.date, value: p.count }))} bucket={d?.range.bucket ?? 'week'} valueLabel="new signups" />
        </ChartCard>
        <ChartCard
          title="Daily-reset completions"
          subtitle={d ? `Grouped by ${d.range.bucket} — a proxy for how active the site is` : undefined}
          table={<SimpleTable columns={['Date', 'Completions']} rows={(d?.completions_over_time ?? []).map(p => [p.date.slice(0, 10), p.count])} />}
        >
          <TrendChart data={(d?.completions_over_time ?? []).map(p => ({ date: p.date, value: p.count }))} bucket={d?.range.bucket ?? 'week'} valueLabel="completions" />
        </ChartCard>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-white">Breakdowns</h2>
      <div className="mb-4">
        <ChartCard
          title="Users by role"
          subtitle="Tier order carries the color — lightest is the highest role"
          table={<SimpleTable columns={['Role', 'Users']} rows={(d?.role_distribution ?? []).map(r => [r.role_name, r.count])} />}
        >
          <RankedBarChart data={roleBars} barColors={ROLE_RAMP} labelMode="all" valueLabel="users" />
        </ChartCard>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Top streaks"
          subtitle="All active streaks, admin view (not filtered by leaderboard opt-out)"
          table={<SimpleTable columns={['User', 'Streak', 'Games tracked']} rows={(d?.top_streaks ?? []).map(s => [s.username, s.streak_count, s.games_tracked])} />}
        >
          <RankedBarChart data={streakBars} valueLabel="day streak" />
        </ChartCard>
        <ChartCard
          title="Most-tracked games"
          table={<SimpleTable columns={['Game', 'Server', 'Trackers']} rows={(d?.top_games ?? []).map(g => [g.name, g.server, g.tracked_by])} />}
        >
          <RankedBarChart data={gameBars} valueLabel="trackers" />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Region popularity"
          subtitle="Tracked-game count by each game's own server region"
          table={<SimpleTable columns={['Region', 'Trackers', 'Games in region']} rows={(d?.region_popularity ?? []).map(r => [r.region, r.tracked_count, r.game_count])} />}
        >
          <RankedBarChart data={regionBars} valueLabel="trackers" />
        </ChartCard>
        <ChartCard
          title="Users by country"
          subtitle="Derived from each user's timezone — an approximation, not real geolocation"
          table={<SimpleTable columns={['Country', 'Users']} rows={(d?.timezone_breakdown ?? []).map(c => [c.country, c.count])} />}
        >
          <RankedBarChart data={countryBars} valueLabel="users" />
        </ChartCard>
      </div>
    </div>
  );
}
