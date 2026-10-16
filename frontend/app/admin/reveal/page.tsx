'use client';

import { useEffect, useState } from 'react';
import { STREAK_TIERS } from '../../_lib/badges';
import BadgeReveal, { REVEAL_SPEED } from '../../_components/BadgeReveal';

/**
 * Admin-only preview of the badge unlock reveal (BadgeReveal.tsx). No DB, no API calls, gated
 * by the role >= 3 check in admin/layout.tsx, same as /admin/badges.
 *
 * Tuning loop: edit the `rv-*` block in globals.css (or BadgeReveal.tsx), refresh, Play. The
 * speed slider scales every delay and duration through --rv-s, so a single phase (the streak,
 * the flash, the badge whirl) can be watched at quarter speed.
 */
export default function RevealPreviewPage() {
  const [tierKey, setTierKey] = useState<(typeof STREAK_TIERS)[number]['key']>('iron');
  const [days, setDays] = useState(STREAK_TIERS[0].days);
  const [speed, setSpeed] = useState(REVEAL_SPEED);
  const [reduced, setReduced] = useState(false);
  const [loop, setLoop] = useState(false);
  const [playKey, setPlayKey] = useState<number | null>(null);

  const tier = STREAK_TIERS.find(t => t.key === tierKey)!;

  // Auto-loop: replays every 5.5 s (scaled by speed) until the overlay is closed.
  useEffect(() => {
    if (!loop || playKey === null) return;
    const id = setTimeout(() => setPlayKey(k => (k ?? 0) + 1), 5500 / speed);
    return () => clearTimeout(id);
  }, [loop, playKey, speed]);

  const pickTier = (key: typeof tierKey) => {
    setTierKey(key);
    setDays(STREAK_TIERS.find(t => t.key === key)!.days);
  };

  const play = () => setPlayKey(k => (k ?? 0) + 1);

  return (
    <div className="mx-auto max-w-3xl" style={{ color: 'var(--text)' }}>
      <div className="mb-8">
        <h1 className="mb-2 text-xl font-bold text-white">Badge reveal preview</h1>
        <p className="text-sm" style={{ color: 'var(--text2)' }}>
          Edit the <code>rv-*</code> block in <code>globals.css</code>, refresh, and press Play.
          Click or Esc skips to the end, the next click closes.
        </p>
      </div>

      <div
        className="kintsugi-card no-veins space-y-6 rounded-xl p-6"
        style={{ border: '1px solid rgba(200,155,60,0.12)', background: 'var(--bg2)' }}
      >
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Tier</p>
          <div className="flex flex-wrap gap-2">
            {STREAK_TIERS.map(t => {
              const active = t.key === tierKey;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => pickTier(t.key)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                  style={{
                    border: `1px solid ${active ? 'var(--gold)' : 'var(--border2)'}`,
                    background: active ? 'rgba(200,145,60,0.12)' : 'transparent',
                    color: active ? 'var(--gold-bright)' : 'var(--text2)',
                  }}
                >
                  <span
                    className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                    style={{ background: `linear-gradient(135deg, ${t.colorDark}, ${t.colorLight})` }}
                  />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block text-sm" style={{ color: 'var(--text2)' }}>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Streak days</span>
            <input
              type="number"
              min={1}
              value={days}
              onChange={e => setDays(Math.max(1, Number(e.target.value) || 1))}
              className="w-28 rounded-lg px-3 py-1.5 text-sm text-white outline-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border2)' }}
            />
          </label>

          <label className="block text-sm" style={{ color: 'var(--text2)' }}>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>
              Speed {speed.toFixed(2)}×
            </span>
            <input
              type="range"
              min={0.25}
              max={2}
              step={0.05}
              value={speed}
              onChange={e => setSpeed(Number(e.target.value))}
              className="w-full accent-[#c8913c]"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-sm" style={{ color: 'var(--text2)' }}>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)} />
            Force reduced motion
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} />
            Auto-loop
          </label>
        </div>

        <button
          type="button"
          onClick={play}
          className="rounded-lg px-5 py-2 text-sm font-semibold"
          style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
        >
          {playKey === null ? 'Play' : 'Replay'}
        </button>
      </div>

      {playKey !== null && (
        <BadgeReveal
          key={`${playKey}-${tierKey}`}
          tier={tier}
          streakDays={days}
          speed={speed}
          forceReducedMotion={reduced}
          onClose={() => {
            setPlayKey(null);
            setLoop(false);
          }}
        />
      )}
    </div>
  );
}
