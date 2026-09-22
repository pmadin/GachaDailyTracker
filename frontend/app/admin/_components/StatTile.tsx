'use client';

// Stat-tile contract (dataviz skill): label sentence case no trailing colon, value in the
// font's default proportional figures (never tabular-nums at this size — see marks-and-
// anatomy.md), sublabel optional context. No delta/sparkline in v1.
export default function StatTile({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div
      className="kintsugi-card rounded-xl p-5"
      style={{ border: '1px solid rgba(200,155,60,0.12)', background: 'var(--bg2)' }}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      {sublabel && <p className="mt-1 text-xs text-zinc-500">{sublabel}</p>}
    </div>
  );
}
