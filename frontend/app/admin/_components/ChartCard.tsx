'use client';

import { useState, type ReactNode } from 'react';

/**
 * Card shell for every analytics chart: title/subtitle, the chart itself, and a "View as
 * table" toggle that renders the same data as a plain HTML table — the WCAG-clean twin
 * every chart needs per the dataviz skill, so no value is only reachable by hovering an SVG.
 */
export default function ChartCard({
  title,
  subtitle,
  children,
  table,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  table: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <div
      className="kintsugi-card no-veins rounded-xl p-5"
      style={{ border: '1px solid rgba(200,155,60,0.12)', background: 'var(--bg2)' }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
        </div>
        <button
          onClick={() => setShowTable(s => !s)}
          className="flex-shrink-0 rounded-lg border border-[rgba(200,155,60,0.15)] px-2.5 py-1 text-xs text-[#9a8570] transition-colors hover:border-[rgba(200,155,60,0.3)] hover:text-[#f0ede8]"
        >
          {showTable ? 'View chart' : 'View as table'}
        </button>
      </div>
      {showTable ? table : children}
    </div>
  );
}
