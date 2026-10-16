'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import PolyhedronBadge from './PolyhedronBadge';
import { STREAK_TIERS, type StreakTier } from '../_lib/badges';
import { solidFor, greatStellatedDodecahedronFor, type SolidName } from '../_lib/polyhedra';

// Real playback speed. The CSS timings were written at 1x, but 0.5x (picked on /admin/reveal)
// reads better, so that's what users see. --rv-s = 1 / speed.
export const REVEAL_SPEED = 0.5;

// When the sequence is "done" (hint visible, next click closes), in ms at 1x speed.
// Matches the .rv-hint delay in globals.css.
const DONE_AT = 3200;
// Confetti fires with the impact flash. Matches the .rv-rays delay in globals.css.
const CONFETTI_AT = 1050;

// Light streaks: one per face of the tier's solid (tetrahedron 4, cube 6, octahedron 8,
// dodecahedron 12, icosahedron 20), read from the same geometry the badge renders so the two
// never drift apart. The great stellated dodecahedron counts its visible triangles instead:
// 12 pentagram faces x 5 star points = 60, so Diamond tops the list rather than landing
// below Platinum.
function faceCount(tier: StreakTier): number {
  return tier.solid === 'great-stellated-dodecahedron'
    ? greatStellatedDodecahedronFor(64).length * 5
    : solidFor(tier.solid as SolidName, 64).length;
}

// Each streak takes 700ms, so these delays land the hits between ~850ms and the ~1000ms
// impact flash. Angles are spread evenly around the circle with a little jitter, and the
// hit order follows the golden ratio so they don't arrive in a clockwise sweep.
const STREAK_FIRST_DELAY = 150;
const STREAK_WINDOW = 150;
function buildStreaks(n: number): { angle: number; delay: number }[] {
  const step = 360 / n;
  return Array.from({ length: n }, (_, i) => {
    const jitter = (((i * 0.7548776662) % 1) - 0.5) * step * 0.6;
    const order = (i * 0.6180339887) % 1;
    return {
      angle: 135 + i * step + jitter,
      delay: STREAK_FIRST_DELAY + (n > 1 ? order * STREAK_WINDOW : 0),
    };
  });
}

/**
 * Gacha-pull style overlay for a newly unlocked streak badge: dim, light streak, flash,
 * rays, the badge whirling in, then the tier name. Timings live in the `rv-*` block in
 * globals.css; tune them on /admin/reveal.
 *
 * The first click/Esc/Space/Enter skips to the final card, the next one closes it.
 * `speed` and `forceReducedMotion` exist for the preview page.
 */
export default function BadgeReveal({
  tier,
  streakDays,
  onClose,
  speed = REVEAL_SPEED,
  forceReducedMotion = false,
}: {
  tier: StreakTier;
  streakDays: number;
  onClose: () => void;
  speed?: number;
  forceReducedMotion?: boolean;
}) {
  const [done, setDone] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [badgeSize] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 120 : 160));
  const closeRef = useRef<HTMLButtonElement>(null);
  const confettiFired = useRef(false);
  const doneRef = useRef(false);

  const rank = STREAK_TIERS.findIndex(t => t.key === tier.key);
  const streaks = useMemo(() => buildStreaks(faceCount(tier)), [tier]);
  // Thinner lines once there are a lot of them, so 20 or 60 streaks don't turn into a blob.
  const streakHeight = streaks.length > 30 ? 1.5 : streaks.length > 12 ? 2 : 3;
  const scale = 1 / speed;

  const reducedMotion = useCallback(
    () => forceReducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [forceReducedMotion],
  );

  const fireConfetti = useCallback(() => {
    if (confettiFired.current || reducedMotion()) return;
    confettiFired.current = true;
    const colors = [tier.colorDark, tier.colorLight, '#fdf0c0'];
    import('canvas-confetti').then(({ default: confetti }) => {
      const base = { colors, zIndex: 1000, disableForReducedMotion: true, origin: { x: 0.5, y: 0.42 } };
      confetti({ ...base, particleCount: 50 + rank * 25, spread: 70 + rank * 12, startVelocity: 34 + rank * 4 });
      if (rank >= 3) {
        confetti({ ...base, particleCount: 40, angle: 60, spread: 55, origin: { x: 0, y: 0.7 } });
        confetti({ ...base, particleCount: 40, angle: 120, spread: 55, origin: { x: 1, y: 0.7 } });
      }
    });
  }, [rank, reducedMotion, tier.colorDark, tier.colorLight]);

  const finish = useCallback(() => {
    doneRef.current = true;
    setDone(true);
  }, []);

  // One timer for the confetti, one for "done". Skipping fires both straight away.
  useEffect(() => {
    const t1 = setTimeout(fireConfetti, CONFETTI_AT * scale);
    const t2 = setTimeout(finish, (reducedMotion() ? 300 : DONE_AT) * scale);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [fireConfetti, finish, reducedMotion, scale]);

  const advance = useCallback(() => {
    if (doneRef.current) {
      onClose();
      return;
    }
    setSkipped(true);
    fireConfetti();
    finish();
  }, [finish, fireConfetti, onClose]);

  // Keyboard, focus and scroll lock.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        advance();
      } else if (e.key === 'Tab') {
        // The close button is the only focusable element; keep focus on it.
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [advance]);

  if (typeof document === 'undefined') return null;

  const rootStyle = {
    '--rv-s': scale,
    '--rv-c1': tier.colorDark,
    '--rv-c2': tier.colorLight,
  } as CSSProperties;

  return createPortal(
    <div
      className={`rv-root${skipped ? ' rv-skip' : ''}`}
      style={rootStyle}
      data-rank={rank}
      data-reduced={forceReducedMotion ? 'true' : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rv-title"
      onClick={advance}
    >
      <div className="rv-backdrop rv-in" />

      <div className="rv-rays rv-in" aria-hidden="true">
        <div className="rv-rays-spin" />
        {rank >= 3 && <div className="rv-rays-spin rv-rays-alt" />}
      </div>

      {streaks.map((s, i) => (
        <div
          key={i}
          className="rv-streak rv-in"
          aria-hidden="true"
          style={{ '--rv-angle': `${s.angle}deg`, '--rv-d': `${s.delay}ms`, '--rv-h': `${streakHeight}px` } as CSSProperties}
        />
      ))}
      <div className="rv-ring rv-in" aria-hidden="true" />
      <div className="rv-flash rv-in" aria-hidden="true" />
      {rank >= 5 && (
        <div className="rv-flash rv-in" aria-hidden="true" style={{ '--rv-d': '1500ms' } as CSSProperties} />
      )}

      <div className="rv-stage">
        <div className="rv-badge rv-in">
          <div className="rv-halo" aria-hidden="true" />
          <div className="rv-badge-whirl rv-in">
            <PolyhedronBadge tier={tier} locked={false} size={badgeSize} spin={!forceReducedMotion} />
          </div>
        </div>
        <p className="rv-label rv-in">— NEW BADGE —</p>
        <h2 id="rv-title" className="rv-title rv-in">
          <span className="rv-title-shimmer">{tier.label}</span>
        </h2>
        <p className="rv-sub rv-in">
          {streakDays}-day streak
        </p>
        <p className="rv-hint rv-in" aria-hidden={!done}>
          TAP ANYWHERE TO CONTINUE
        </p>
      </div>

      <button
        ref={closeRef}
        type="button"
        className="rv-close"
        aria-label="Close"
        onClick={e => { e.stopPropagation(); onClose(); }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}
