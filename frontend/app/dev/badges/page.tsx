'use client';

import { useState } from 'react';
import { STREAK_TIERS } from '../../_lib/badges';
import PolyhedronBadge from '../../_components/PolyhedronBadge';

/**
 * Dev-only preview of the streak achievement badges — no auth, no DB, no API calls. Not
 * linked from any nav; reachable only by typing the URL.
 *
 * This exists because iterating on the polyhedron geometry (_lib/polyhedra.ts) by logging in
 * as a scratch-DB user, navigating to /profile, and re-checking each time would be a slow,
 * DB-dependent feedback loop for what's really just component/CSS iteration. This page is
 * where the actual geometry gets debugged: edit polyhedra.ts, refresh this one static page.
 * Cheap enough to leave in the repo afterward as a standing tool for any future tweak to
 * colors/geometry, rather than deleting it once the feature ships.
 *
 * Defaults to a STATIC (non-spinning) render — a moving target is much harder to check the
 * raw face geometry against than a frozen one, so debugging the shapes themselves should
 * happen here first; flip the toggle on to check the spin/animation separately once the
 * static shapes look right.
 */
export default function BadgesPreviewPage() {
  const [spin, setSpin] = useState(false);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12" style={{ color: 'var(--text)' }}>
      <div className="mb-10 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 text-xl font-bold text-white">Streak badge preview (dev only)</h1>
          <p className="text-sm" style={{ color: 'var(--text2)' }}>
            Not linked anywhere. Reload after editing <code>_lib/polyhedra.ts</code> or{' '}
            <code>_lib/badges.ts</code> — no login, no DB, no API calls on this page.
          </p>
        </div>
        <label className="flex flex-shrink-0 items-center gap-2 rounded-lg border border-[rgba(200,155,60,0.15)] px-3 py-2 text-sm" style={{ color: 'var(--text2)' }}>
          <input type="checkbox" checked={spin} onChange={e => setSpin(e.target.checked)} />
          Spin
        </label>
      </div>

      <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
        {STREAK_TIERS.map(tier => (
          <div
            key={tier.key}
            className="kintsugi-card rounded-xl p-6"
            style={{ border: '1px solid rgba(200,155,60,0.12)', background: 'var(--bg2)' }}
          >
            <p className="mb-1 text-sm font-semibold text-white">{tier.label}</p>
            <p className="mb-4 text-xs" style={{ color: 'var(--text3)' }}>
              {tier.days}-day streak · {tier.solid}
            </p>
            <div className="flex items-center justify-around">
              <div className="flex flex-col items-center gap-2">
                <PolyhedronBadge tier={tier} locked={false} size={72} spin={spin} />
                <span className="text-xs" style={{ color: 'var(--text2)' }}>earned</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <PolyhedronBadge tier={tier} locked={true} size={72} spin={spin} />
                <span className="text-xs" style={{ color: 'var(--text3)' }}>locked</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 kintsugi-card rounded-xl p-6" style={{ border: '1px solid rgba(200,155,60,0.12)', background: 'var(--bg2)' }}>
        <p className="mb-4 text-sm font-semibold text-white">Large — all 6, earned, side by side</p>
        <div className="flex flex-wrap items-end justify-center gap-6">
          {STREAK_TIERS.map(tier => (
            <div key={tier.key} className="flex flex-col items-center gap-2">
              <PolyhedronBadge tier={tier} locked={false} size={120} spin={spin} />
              <span className="text-xs" style={{ color: 'var(--text2)' }}>{tier.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
