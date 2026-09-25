'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CANVAS,
  PRESETS,
  RANGES,
  clampParams,
  generateVeins,
  twoToneSvg,
  veinSvg,
  type VeinParams,
} from './veinGenerator';

/**
 * Admin-only kintsugi background generator (experimental). The islands are the only shapes: a
 * solid gold canvas with dark islands on top, and the veins are the gold showing through. Exports
 * in the style of /public/kintsugi-veins-*.svg and previews them the way the site uses them.
 * Nothing here writes to /public, pick a result and save it by hand.
 *
 * All settings live in the URL query, so a result can be shared or regenerated exactly.
 */

type NumKey = Exclude<keyof VeinParams, 'seed'>;

const SLIDERS: { key: NumKey; label: string; step: number; hint: string }[] = [
  { key: 'islands', label: 'Islands', step: 1, hint: 'About how many islands land on the canvas' },
  { key: 'flow', label: 'Flow', step: 0.05, hint: '0 = split islands evenly, higher = cracks follow the angle (longer islands)' },
  { key: 'angle', label: 'Angle', step: 1, hint: 'Direction the cracks lean toward' },
  { key: 'warp', label: 'Curviness', step: 1, hint: 'How far the cracks bend (px)' },
  { key: 'warpScale', label: 'Bend scale', step: 10, hint: 'Lower = tighter bends, higher = long sweeping curves' },
  { key: 'veinWidth', label: 'Vein width', step: 0.5, hint: 'Typical gap between islands (px)' },
  { key: 'hierarchy', label: 'Hierarchy', step: 0.05, hint: 'How much thicker the first cracks are than later branches' },
  { key: 'widthVariation', label: 'Width variation', step: 0.05, hint: 'Random per-crack width and slow swelling' },
  { key: 'tipMerge', label: 'Tip merge', step: 5, hint: 'Island sides shorter than this are absorbed: fewer, cleaner tips' },
  { key: 'tipAngle', label: 'Tip angle', step: 5, hint: 'How sharply a corner must turn to stay a pointed tip; gentler corners get rounded' },
  { key: 'smoothness', label: 'Smoothness', step: 0.1, hint: 'Curve-fit tolerance: higher = fewer, longer curves' },
];

const COLORS = [
  { value: '#c8913c', label: 'Gold (login)' },
  { value: '#e9cc7b', label: 'Light gold (homepage)' },
  { value: '#e8c86a', label: 'Gold bright' },
];

type Preview = 'raw' | 'outline' | 'login' | 'homepage' | 'card' | 'compare';
const PREVIEWS: { key: Preview; label: string }[] = [
  { key: 'raw', label: 'Raw' },
  { key: 'outline', label: 'Island outlines' },
  { key: 'login', label: 'Login page' },
  { key: 'homepage', label: 'Homepage hero' },
  { key: 'card', label: 'Card hover' },
  { key: 'compare', label: 'vs. current' },
];

// Same masks the real pages use (login/register/forgot/reset, and MarketingHero).
const AUTH_MASK = 'radial-gradient(ellipse 60% 55% at 50% 50%, transparent 0%, rgba(0,0,0,0.6) 45%, black 75%)';
const HERO_MASK = 'radial-gradient(ellipse 85% 75% at 50% 30%, black 10%, transparent 100%)';

interface Settings extends VeinParams { color: string }

const DEFAULTS: Settings = { seed: 1, ...PRESETS.delta, color: '#c8913c' };

function readUrl(): Settings {
  if (typeof window === 'undefined') return DEFAULTS;
  const q = new URLSearchParams(window.location.search);
  const out: Settings = { ...DEFAULTS };
  for (const k of ['seed', ...SLIDERS.map(s => s.key)] as (keyof VeinParams)[]) {
    const v = q.get(k);
    if (v !== null && !Number.isNaN(Number(v))) out[k] = Number(v);
  }
  const color = q.get('color');
  if (color && /^#[0-9a-f]{6}$/i.test(color)) out.color = color;
  return { ...clampParams(out), color: out.color };
}

const randomSeed = () => Math.floor(Math.random() * 1_000_000);

function download(name: string, svg: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function KintsugiGeneratorPage() {
  const [draft, setDraft] = useState<Settings>(readUrl);
  const [committed, setCommitted] = useState<Settings>(draft);
  const [preview, setPreview] = useState<Preview>('raw');
  const [copied, setCopied] = useState(false);

  // Debounce slider drags: the generator takes a few hundred ms, so only run it once input settles.
  useEffect(() => {
    const t = setTimeout(() => setCommitted(draft), 250);
    return () => clearTimeout(t);
  }, [draft]);

  useEffect(() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(committed)) q.set(k, String(v));
    window.history.replaceState(null, '', `?${q.toString()}`);
  }, [committed]);

  const result = useMemo(() => generateVeins(committed), [committed]);
  const svg = useMemo(() => veinSvg(result.islandsD, committed.color), [result, committed.color]);
  const twoTone = useMemo(() => twoToneSvg(result.islandsD, committed.color), [result, committed.color]);
  const bgUrl = useMemo(() => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`, [svg]);
  const kb = (new Blob([svg]).size / 1024).toFixed(1);
  const pending = draft !== committed;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft(d => ({ ...d, [k]: v }));
  const fileBase = `kintsugi-veins-${committed.seed}`;

  const layer = (extra: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    inset: 0,
    backgroundImage: bgUrl,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    pointerEvents: 'none',
    ...extra,
  });

  return (
    <div style={{ color: 'var(--text)' }}>
      <div className="mb-6">
        <h1 className="mb-1 text-xl font-bold text-white">Kintsugi background generator</h1>
        <p className="text-sm" style={{ color: 'var(--text2)' }}>
          Experimental. A solid gold canvas with dark islands on top: the islands are the only shapes, and the veins are
          the gold showing through. Settings are in the URL, so copy it to share a result.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* ── Controls ── */}
        <div className="kintsugi-card no-veins rounded-xl p-4" style={{ background: 'var(--bg2)' }}>
          <div className="mb-4 flex items-end gap-2">
            <label className="flex-1 text-xs" style={{ color: 'var(--text2)' }}>
              Seed
              <input
                type="number"
                value={draft.seed}
                onChange={e => set('seed', Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg px-3 py-1.5 text-sm outline-none"
                style={{ background: 'rgba(8,8,8,0.8)', border: '1px solid rgba(200,155,60,0.18)', color: 'var(--text)' }}
              />
            </label>
            <button
              onClick={() => set('seed', randomSeed())}
              className="rounded-lg px-3 py-1.5 text-sm font-medium hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
            >
              Randomize
            </button>
          </div>

          <div className="mb-4 flex gap-2">
            {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map(name => (
              <button
                key={name}
                onClick={() => setDraft(d => ({ ...d, ...PRESETS[name] }))}
                className="flex-1 rounded-lg px-2 py-1.5 text-xs capitalize transition-colors hover:bg-[rgba(200,155,60,0.08)]"
                style={{ border: '1px solid rgba(200,155,60,0.28)', color: 'var(--gold-bright)' }}
              >
                {name} preset
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            {SLIDERS.map(s => (
              <label key={s.key} className="block text-xs" title={s.hint}>
                <span className="flex justify-between" style={{ color: 'var(--text2)' }}>
                  <span>{s.label}</span>
                  <span className="tabular-nums" style={{ color: 'var(--text)' }}>{draft[s.key]}</span>
                </span>
                <input
                  type="range"
                  min={RANGES[s.key][0]}
                  max={RANGES[s.key][1]}
                  step={s.step}
                  value={draft[s.key]}
                  onChange={e => set(s.key, Number(e.target.value))}
                  className="mt-1 w-full accent-[#c8913c]"
                />
              </label>
            ))}
            <label className="block text-xs" style={{ color: 'var(--text2)' }}>
              Color
              <select
                value={draft.color}
                onChange={e => set('color', e.target.value)}
                className="mt-1 w-full rounded-lg px-3 py-1.5 text-sm outline-none"
                style={{ background: 'rgba(8,8,8,0.8)', border: '1px solid rgba(200,155,60,0.18)', color: 'var(--text)' }}
              >
                {COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        {/* ── Preview ── */}
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {PREVIEWS.map(p => (
              <button
                key={p.key}
                onClick={() => setPreview(p.key)}
                className="rounded-full px-3 py-1 text-xs transition-colors"
                style={
                  preview === p.key
                    ? { background: 'rgba(200,155,60,0.15)', color: 'var(--gold-bright)', border: '1px solid rgba(200,155,60,0.35)' }
                    : { color: 'var(--text2)', border: '1px solid rgba(200,155,60,0.12)' }
                }
              >
                {p.label}
              </button>
            ))}
            <span className="ml-auto text-xs tabular-nums" style={{ color: 'var(--text3)' }}>
              {pending ? 'generating…' : `${result.ms} ms · ${kb} KB · ${result.islands} islands · ${result.tips.length} tips · ${result.curves} curves`}
            </span>
          </div>

          <div className="overflow-hidden rounded-xl" style={{ border: '1px solid rgba(200,155,60,0.12)', opacity: pending ? 0.6 : 1, transition: 'opacity 0.2s' }}>
            {preview === 'raw' && (
              <svg viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`} className="block w-full">
                <rect width={CANVAS.width} height={CANVAS.height} fill={committed.color} />
                <path fill="#080808" d={result.islandsD} />
              </svg>
            )}

            {preview === 'outline' && (
              <svg viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`} className="block w-full" style={{ background: '#080808' }}>
                <path fill="rgba(200,145,60,0.06)" stroke={committed.color} strokeWidth={1.5} d={result.islandsD} />
                {result.tips.map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r={4} fill="none" stroke="#e8c86a" strokeWidth={1.5} />
                ))}
              </svg>
            )}

            {preview === 'login' && (
              <div className="relative flex h-[480px] items-center justify-center" style={{ background: 'var(--bg)' }}>
                <div style={layer({ maskImage: AUTH_MASK, WebkitMaskImage: AUTH_MASK, opacity: 0.25 })} />
                <div className="relative w-72 rounded-xl p-6 text-center" style={{ zIndex: 1 }}>
                  <p className="mb-4 text-2xl font-bold text-white">Welcome back</p>
                  <div className="mb-3 h-10 rounded-lg" style={{ background: 'rgba(8,8,8,0.8)', border: '1px solid rgba(200,155,60,0.18)' }} />
                  <div className="mb-4 h-10 rounded-lg" style={{ background: 'rgba(8,8,8,0.8)', border: '1px solid rgba(200,155,60,0.18)' }} />
                  <div className="h-10 rounded-lg" style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)' }} />
                </div>
              </div>
            )}

            {preview === 'homepage' && (
              <div className="relative h-[480px]" style={{ background: 'var(--bg)' }}>
                <div style={layer({ backgroundPosition: 'center top', maskImage: HERO_MASK, WebkitMaskImage: HERO_MASK, opacity: 0.45 })} />
                <div className="relative px-10 pt-24" style={{ zIndex: 1 }}>
                  <p className="mb-3 text-xs tracking-[0.3em]" style={{ color: 'var(--text2)', fontFamily: 'var(--font-jetbrains-mono)' }}>
                    — GACHA DAILY TRACKER —
                  </p>
                  <p className="max-w-md text-4xl font-extrabold text-white" style={{ fontFamily: 'var(--font-display)' }}>
                    Never miss a daily reset again.
                  </p>
                </div>
              </div>
            )}

            {preview === 'card' && (
              <div className="grid gap-4 p-6 sm:grid-cols-2" style={{ background: 'var(--bg)' }}>
                {['At rest', 'Hover (opacity 0.5)'].map((label, i) => (
                  <div key={label} className="relative h-40 overflow-hidden rounded-xl p-5" style={{ background: 'var(--bg2)', border: `1px solid rgba(200,155,60,${i ? 0.28 : 0.12})` }}>
                    {i === 1 && <div style={layer({ opacity: 0.5 })} />}
                    <p className="relative text-base font-semibold text-white">{label}</p>
                    <p className="relative mt-1 text-xs" style={{ color: 'var(--text2)' }}>.kintsugi-card treatment</p>
                  </div>
                ))}
              </div>
            )}

            {preview === 'compare' && (
              <div className="grid gap-3 p-3 md:grid-cols-3" style={{ background: 'var(--bg)' }}>
                {[
                  { label: 'Generated', src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` },
                  { label: 'Current: login-reg', src: '/kintsugi-veins-login-reg.svg' },
                  { label: 'Current: homepage', src: '/kintsugi-veins-homepage.svg' },
                ].map(item => (
                  <figure key={item.label}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.src} alt={item.label} className="block w-full rounded-lg" style={{ background: '#080808', aspectRatio: `${CANVAS.width}/${CANVAS.height}` }} />
                    <figcaption className="mt-1 text-center text-xs" style={{ color: 'var(--text2)' }}>{item.label}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => download(`${fileBase}.svg`, svg)}
              className="rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
            >
              Download SVG
            </button>
            <button
              onClick={() => download(`${fileBase}-two-tone.svg`, twoTone)}
              className="rounded-lg px-4 py-2 text-sm transition-colors hover:bg-[rgba(200,155,60,0.08)]"
              style={{ border: '1px solid rgba(200,155,60,0.28)', color: 'var(--gold-bright)' }}
            >
              Download two-tone SVG
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(svg).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
              className="rounded-lg px-4 py-2 text-sm transition-colors hover:bg-[rgba(200,155,60,0.08)]"
              style={{ border: '1px solid rgba(200,155,60,0.28)', color: 'var(--gold-bright)' }}
            >
              {copied ? 'Copied' : 'Copy SVG'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
