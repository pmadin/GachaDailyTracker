'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { getNextResetMs, msToCountdown } from '../../_lib/countdown';
import { streakProgress } from '../../_lib/badges';
import type { TrayGame } from '../GamesTray';

interface Props {
  games: TrayGame[];
  streak: number;
  /** null while /auth/profile is still loading; the streak card falls back to the current streak. */
  streakBest: number | null;
}

const eyebrowStyle: CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono)',
  fontSize: 11,
  color: 'var(--text3)',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  margin: 0,
};

const bigNumberStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 800,
  fontSize: 32,
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
};

const goldText: CSSProperties = {
  background: 'linear-gradient(135deg, #c8913c, #e8c86a)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
};

function formatShort(ms: number): string {
  const { hours, minutes, seconds } = msToCountdown(ms);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function Card({ children, href }: { children: ReactNode; href?: string }) {
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '16px 18px',
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--bg2)',
    textDecoration: 'none',
    minWidth: 0,
  };
  return href ? (
    <Link href={href} className="kintsugi-card no-veins" style={style}>{children}</Link>
  ) : (
    <div className="kintsugi-card no-veins" style={style}>{children}</div>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <div style={{ height: 4, borderRadius: 2, background: 'var(--surface)', overflow: 'hidden' }}>
      <div
        style={{
          height: '100%',
          borderRadius: 2,
          width: `${Math.max(0, Math.min(value, 1)) * 100}%`,
          background: 'linear-gradient(135deg, #c8913c, #e8c86a)',
          transition: 'width 0.4s ease',
        }}
      />
    </div>
  );
}

export default function StatusRow({ games, streak, streakBest }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const total = games.length;
  const done = games.filter(g => g.done).length;
  const left = total - done;

  const best = Math.max(streakBest ?? 0, streak);
  const { nextTier, progress, daysLeft } = streakProgress(streak, best);

  // Soonest reset among unfinished games; once everything is done, the soonest reset overall.
  const pool = left > 0 ? games.filter(g => !g.done) : games;
  let next: { game: TrayGame; ms: number } | null = null;
  for (const g of pool) {
    const ms = getNextResetMs(g.timezone, g.daily_reset);
    if (!next || ms < next.ms) next = { game: g, ms };
  }

  // Signed-in with an empty list: only the streak card is worth showing, and only if it's live.
  if (total === 0 && streak === 0) return null;

  return (
    <div className={`grid grid-cols-1 gap-3 ${total > 0 ? 'sm:grid-cols-3' : ''}`} style={{ marginBottom: 28 }}>
      {total > 0 && (
        <Card>
          <p style={eyebrowStyle}>Today</p>
          <p style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ ...bigNumberStyle, ...(done > 0 ? goldText : { color: 'var(--text3)' }) }}>{done}</span>
            <span style={{ fontSize: 14, color: 'var(--text2)' }}>/ {total} done</span>
          </p>
          <Bar value={total > 0 ? done / total : 0} />
          <p style={{ margin: 0, fontSize: 12, color: left === 0 ? 'var(--gold-bright)' : 'var(--text2)' }}>
            {left === 0 ? 'All done for today ✓' : `${left} left to go`}
          </p>
        </Card>
      )}

      <Card href="/profile">
        <p style={eyebrowStyle}>Streak</p>
        <p style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ ...bigNumberStyle, ...(streak > 0 ? goldText : { color: 'var(--text3)' }) }}>{streak}</span>
          <span style={{ fontSize: 14, color: 'var(--text2)' }}>day{streak === 1 ? '' : 's'}</span>
        </p>
        {nextTier ? (
          <>
            <Bar value={progress} />
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text2)' }}>
              {streak === 0
                ? <>Finish every game today to start one</>
                : <>{daysLeft} more day{daysLeft === 1 ? '' : 's'} to <span style={{ color: 'var(--gold-bright)' }}>{nextTier.label}</span></>}
            </p>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--gold-bright)' }}>Every badge earned. Keep it going.</p>
        )}
      </Card>

      {total > 0 && next && (
        <Card>
          <p style={eyebrowStyle}>{left > 0 ? 'Next reset' : 'All clear'}</p>
          <p style={{ margin: 0, ...bigNumberStyle, fontSize: 26, color: left > 0 && next.ms < 3 * 3600_000 ? 'var(--amber)' : 'var(--text)' }}>
            {formatShort(next.ms)}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: 'var(--text2)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {left > 0 ? <>{next.game.name} resets next</> : <>until {next.game.name} resets</>}
          </p>
        </Card>
      )}
    </div>
  );
}
