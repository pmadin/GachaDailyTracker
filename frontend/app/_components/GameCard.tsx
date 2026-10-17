'use client';

import type { Game } from '../_lib/api';
import { displayServer } from '../_lib/servers';
import { gameIconSrc } from '../_lib/icons';

interface Props {
  game: Game;
  isTracked: boolean;
  onAdd: (game: Game) => void;
  onRemove: (game: Game) => void;
  priority?: boolean;
  /** Overrides the icon URL (admin submission preview shows an icon that isn't saved yet). */
  iconSrc?: string;
}

function formatResetTime(dailyReset: string): string {
  const [h, m] = dailyReset.split(':').map(Number);
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default function GameCard({ game, isTracked, onAdd, onRemove, priority, iconSrc }: Props) {
  return (
    <div className="kintsugi-card flex flex-col gap-3 rounded-xl p-4" style={{ border: '1px solid rgba(200,155,60,0.12)', background: 'var(--bg2)' }}>
      <div className="flex items-start gap-2">
        <div style={{ width: 36, height: 36, flexShrink: 0, display: 'block' }}>
          <img
            src={iconSrc ?? gameIconSrc(game.icon_name)}
            alt=""
            width={36}
            height={36}
            style={{ aspectRatio: '1 / 1' }}
            className="rounded-lg object-cover"
            loading={priority ? 'eager' : undefined}
            fetchPriority={priority ? 'high' : undefined}
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/placeholder.svg'; }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-snug text-white">{game.name}</h3>
          <span
            title={game.server}
            className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ background: 'rgba(200,155,60,0.08)', color: 'var(--text3)' }}
          >
            {displayServer(game.server)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1 text-xs text-zinc-500">
        <span>Reset {formatResetTime(game.daily_reset)}</span>
        <span className="truncate">{game.timezone}</span>
      </div>

      <button
        onClick={() => (isTracked ? onRemove(game) : onAdd(game))}
        className={`mt-auto w-full rounded-lg py-1.5 text-xs font-medium transition-colors ${
          isTracked ? 'bg-[#18140d] text-[#9a8570] hover:bg-red-950 hover:text-red-400' : 'hover:opacity-90'
        }`}
        style={isTracked ? undefined : { background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
      >
        {isTracked ? 'Remove' : '+ Add to list'}
      </button>
    </div>
  );
}
