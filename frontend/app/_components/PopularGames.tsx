'use client';

import { useState } from 'react';
import type { PopularGame } from '../_lib/api';
import ServerBadge from './ServerBadge';

interface Props {
  games: PopularGame[];
  context: 'logged-out' | 'empty' | 'has-games' | 'personal';
  trackedIds: Set<number>;
  onAdd: (game: PopularGame) => Promise<void>;
}

export default function PopularGames({ games, context, trackedIds, onAdd }: Props) {
  const eyebrow = {
    'logged-out': 'Popular now',
    'empty': 'Popular now',
    'has-games': 'Popular now',
    'personal': 'Popular with other players',
  }[context];

  return (
    <section>
      <div style={{ marginBottom: 12 }}>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 11,
            letterSpacing: '0.08em',
            color: 'var(--gold-bright)',
            textTransform: 'uppercase',
          }}
        >
          {eyebrow}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {games.map((g, i) => (
          <PopularRow
            key={g.id}
            game={g}
            rank={i + 1}
            isTracked={trackedIds.has(g.id)}
            onAdd={onAdd}
          />
        ))}
      </div>
    </section>
  );
}

function PopularRow({
  game,
  rank,
  isTracked,
  onAdd,
}: {
  game: PopularGame;
  rank: number;
  isTracked: boolean;
  onAdd: (game: PopularGame) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (adding || isTracked) return;
    setAdding(true);
    try {
      await onAdd(game);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div
      className="popular-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
      }}
    >
      {/* Rank */}
      <span
        style={{
          width: 20,
          textAlign: 'center',
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 13,
          fontWeight: 500,
          color: rank <= 3 ? 'var(--amber)' : 'var(--text3)',
          flexShrink: 0,
        }}
      >
        {rank}
      </span>

      {/* Icon */}
      <div style={{ width: 44, height: 44, flexShrink: 0, display: 'block' }}>
        <img
          src={game.icon_name ? `${process.env.NEXT_PUBLIC_ICONS_BASE_URL}/${game.icon_name}.gif` : '/placeholder.svg'}
          alt=""
          width={44}
          height={44}
          style={{ borderRadius: 10, objectFit: 'cover', aspectRatio: '1 / 1' }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/placeholder.svg'; }}
        />
      </div>

      {/* Name */}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 14,
          color: 'var(--text)',
        }}
      >
        {game.name}
      </span>

      {/* Server badge */}
      <ServerBadge server={game.server} size="xs" />

      {/* Add / tracked button */}
      <button
        onClick={handleAdd}
        disabled={adding || isTracked}
        title={isTracked ? 'Already tracking' : 'Add to tracker'}
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: isTracked ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--border2)',
          background: isTracked ? 'rgba(16,185,129,0.08)' : 'rgba(200,155,60,0.05)',
          color: isTracked ? 'var(--green)' : 'var(--gold-bright)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isTracked ? 'default' : 'pointer',
          flexShrink: 0,
          opacity: adding ? 0.5 : 1,
          transition: 'opacity 0.15s',
        }}
      >
        {isTracked ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <polyline points="2,6 4.5,8.5 10,3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <line x1="6" y1="2" x2="6" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </div>
  );
}
