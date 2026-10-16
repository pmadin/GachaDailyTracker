'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import PolyhedronBadge from './PolyhedronBadge';
import { STREAK_TIERS, type StreakTier } from '../_lib/badges';

// When the sequence is "done" (hint visible, next click closes), in ms at 1x speed.
// Matches the .rv-hint delay in globals.css.
const DONE_AT = 3200;
// Confetti fires with the impact flash. Matches the .rv-rays delay in globals.css.
const CONFETTI_AT = 1050;

// Streak angles/delays per tier rank: early tiers get one streak, Gold+ two, Diamond three.
const STREAKS: { angle: number; delay: number }[] = [
  { angle: 135, delay: 300 },
  { angle: 162, delay: 420 },
  { angle: 108, delay: 520 },
];

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
  speed = 1,
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
  const streakCount = rank >= 5 ? 3 : rank >= 3 ? 2 : 1;
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

      {STREAKS.slice(0, streakCount).map((s, i) => (
        <div
          key={i}
          className="rv-streak rv-in"
          aria-hidden="true"
          style={{ '--rv-angle': `${s.angle}deg`, '--rv-d': `${s.delay}ms` } as CSSProperties}
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
