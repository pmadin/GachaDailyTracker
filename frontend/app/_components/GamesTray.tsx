'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { getNextResetMs, msToCountdown, formatCountdown } from '../_lib/countdown';

export interface TrayGame {
  id: number;
  name: string;
  icon_name: string;
  server: string;
  timezone: string;
  daily_reset: string;
  done: boolean;
}

interface Props {
  games: TrayGame[];
  onToggle: (gameId: number, done: boolean) => Promise<void>;
  /** Skip the built-in progress bar (the logged-in home page shows it in its status row). */
  hideProgress?: boolean;
}

export default function GamesTray({ games, onToggle, hideProgress = false }: Props) {
  const [tick, setTick] = useState(0);
  const [toggling, setToggling] = useState<Set<number>>(new Set());

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Silence unused-var warning — tick drives re-renders so children recalculate timers
  void tick;

  const sorted = useMemo(() => {
    const undone = games
      .filter(g => !g.done)
      .sort((a, b) => getNextResetMs(a.timezone, a.daily_reset) - getNextResetMs(b.timezone, b.daily_reset));
    const done = games.filter(g => g.done);
    return [...undone, ...done];
  }, [games]);

  const doneCount = games.filter(g => g.done).length;
  const total = games.length;
  const progress = total > 0 ? (doneCount / total) * 100 : 0;

  async function handleToggle(game: TrayGame) {
    if (toggling.has(game.id)) return;
    setToggling(prev => new Set(prev).add(game.id));
    try {
      await onToggle(game.id, game.done);
    } finally {
      setToggling(prev => {
        const next = new Set(prev);
        next.delete(game.id);
        return next;
      });
    }
  }

  return (
    <section>
      {/* Progress bar */}
      {!hideProgress && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 11,
                color: 'var(--text3)',
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
              }}
            >
              Today&apos;s progress
            </span>
            <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, color: 'var(--text2)' }}>
              {doneCount} / {total} done
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--surface)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                borderRadius: 2,
                width: `${progress}%`,
                background: 'linear-gradient(135deg, #c8913c, #e8c86a)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Tray header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 18,
              color: 'var(--text)',
              margin: 0,
            }}
          >
            My Games
          </h2>
          {doneCount > 0 && (
            <span
              style={{
                background: 'rgba(16,185,129,0.1)',
                color: 'var(--green)',
                border: '1px solid rgba(16,185,129,0.2)',
                borderRadius: 999,
                padding: '2px 10px',
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              {doneCount} done
            </span>
          )}
        </div>
        <Link
          href="/dashboard"
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 12,
            color: 'var(--gold-bright)',
            textDecoration: 'none',
          }}
        >
          See all →
        </Link>
      </div>

      {/* Scroll tray — marquee when >9 games, plain scroll otherwise */}
      {sorted.length > 9 ? (
        <div style={{ overflow: 'hidden', height: 196 }}>
          <div
            className="animate-marquee"
            style={{
              display: 'inline-flex',
              gap: 10,
              animationDuration: `${sorted.length * 3}s`,
            }}
          >
            {sorted.map(game => (
              <GameCard
                key={`${game.id}-a`}
                game={game}
                isToggling={toggling.has(game.id)}
                onToggle={() => handleToggle(game)}
              />
            ))}
            {sorted.map(game => (
              <GameCard
                key={`${game.id}-b`}
                game={game}
                isToggling={toggling.has(game.id)}
                onToggle={() => handleToggle(game)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <div
            className="scroll-x-custom"
            style={{
              display: 'flex',
              gap: 10,
              overflowX: 'auto',
              scrollSnapType: 'x mandatory',
              paddingBottom: 8,
            }}
          >
            {sorted.map(game => (
              <GameCard
                key={game.id}
                game={game}
                isToggling={toggling.has(game.id)}
                onToggle={() => handleToggle(game)}
              />
            ))}

            {/* Add game ghost card */}
            <Link
              href="/games"
              style={{
                width: 110,
                minWidth: 110,
                height: 168,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderRadius: 12,
                border: '1.5px dashed var(--border2)',
                background: 'transparent',
                textDecoration: 'none',
                scrollSnapAlign: 'start',
                flexShrink: 0,
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--text3)' }}>
                <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: 'var(--text3)' }}>
                Add game
              </span>
            </Link>
          </div>

          {/* Fade-right overlay */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 8,
              width: 72,
              background: 'linear-gradient(to right, transparent, var(--bg))',
              pointerEvents: 'none',
            }}
          />
        </div>
      )}
    </section>
  );
}

function GameCard({
  game,
  isToggling,
  onToggle,
}: {
  game: TrayGame;
  isToggling: boolean;
  onToggle: () => void;
}) {
  let timerText = '';
  let timerColor = 'var(--text3)';

  if (!game.done) {
    const ms = getNextResetMs(game.timezone, game.daily_reset);
    const parts = msToCountdown(ms);
    timerText = formatCountdown(parts);
    if (parts.hours < 3) timerColor = 'var(--amber)';
  }

  return (
    <div
      className="kintsugi-card"
      style={{
        width: 110,
        minWidth: 110,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        borderRadius: 12,
        border: `1px solid ${game.done ? 'rgba(16,185,129,0.25)' : 'var(--border)'}`,
        background: game.done ? 'rgba(16,185,129,0.04)' : 'var(--bg2)',
        padding: '12px 8px 10px',
        scrollSnapAlign: 'start',
        flexShrink: 0,
        transition: 'border-color 0.2s, background 0.2s',
      }}
    >
      {/* Icon with done badge */}
      <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
        <img
          src={game.icon_name ? `${process.env.NEXT_PUBLIC_ICONS_BASE_URL}/${game.icon_name}.gif` : '/placeholder.svg'}
          alt=""
          width={56}
          height={56}
          style={{ borderRadius: 10, objectFit: 'cover', display: 'block', aspectRatio: '1 / 1' }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/placeholder.svg'; }}
        />
        {game.done && (
          <span
            style={{
              position: 'absolute',
              bottom: -3,
              right: -3,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'var(--green)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <polyline
                points="2,5 4.5,7.5 8,3"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
      </div>

      {/* Game name */}
      <span
        title={game.name}
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text)',
          textAlign: 'center',
          width: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: 1.3,
        }}
      >
        {game.name}
      </span>

      {/* Timer — always rendered to hold space; invisible when done so button stays aligned */}
      <span
        style={{
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 10,
          color: timerColor,
          letterSpacing: '0.02em',
          visibility: game.done ? 'hidden' : 'visible',
        }}
      >
        {timerText || ' '}
      </span>

      {/* Toggle button */}
      <button
        onClick={onToggle}
        disabled={isToggling}
        style={{
          marginTop: 2,
          width: '100%',
          padding: '5px 0',
          borderRadius: 7,
          border: game.done ? '1px solid rgba(200,155,60,0.3)' : '1px solid var(--border2)',
          background: game.done ? 'rgba(200,155,60,0.10)' : 'rgba(200,155,60,0.05)',
          color: game.done ? 'var(--gold-bright)' : 'var(--text3)',
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 10,
          fontWeight: 500,
          cursor: isToggling ? 'wait' : 'pointer',
          opacity: isToggling ? 0.5 : 1,
          transition: 'opacity 0.15s',
        }}
      >
        {game.done ? '✓ done' : 'mark done'}
      </button>
    </div>
  );
}
