'use client';

import CountdownTimer from './CountdownTimer';
import { displayServer } from '../_lib/servers';
import { getLocalResetTime } from '../_lib/countdown';
import { gameIconSrc } from '../_lib/icons';

export interface DashboardGame {
  game_id: number;
  name: string;
  server: string;
  timezone: string;
  daily_reset: string;
  icon_name: string;
  completed_today: boolean;
  custom_reminder_offset?: number;
}

interface Props {
  game: DashboardGame;
  onToggleComplete: (gameId: number, completed: boolean) => void;
  onRemove: (gameId: number) => void;
  onUpdateOffset?: (gameId: number, offset: number) => void;
  onSchedule?: (game: DashboardGame) => void;
  hasSchedule?: boolean;
  hookNotificationsActive?: boolean;
  dragHandle?: React.ReactNode;
  /** Overrides the icon URL (admin submission preview shows an icon that isn't saved yet). */
  iconSrc?: string;
}

const OFFSET_OPTIONS = [
  { value: 0,   label: 'No reminder' },
  { value: 15,  label: '15 min' },
  { value: 60,  label: '1 hr' },
  { value: 120, label: '2 hr' },
  { value: 180, label: '3 hr' },
  { value: 240, label: '4 hr' },
  { value: 300, label: '5 hr' },
  { value: 360, label: '6 hr' },
  { value: 420, label: '7 hr' },
  { value: 480, label: '8 hr' },
  { value: 540, label: '9 hr' },
  { value: 600, label: '10 hr' },
  { value: 660, label: '11 hr' },
  { value: 720, label: '12 hr' },
];

export default function DashboardCard({ game, onToggleComplete, onRemove, onUpdateOffset, onSchedule, hasSchedule, hookNotificationsActive, dragHandle, iconSrc }: Props) {
  const resetAt = game.completed_today ? null : getLocalResetTime(game.timezone, game.daily_reset);

  return (
    <div
      className="kintsugi-card crack-line flex items-center gap-3 rounded-xl px-3 py-3 sm:gap-4 sm:px-4"
      style={{
        borderColor: game.completed_today ? 'rgba(200,155,60,0.3)' : undefined,
        background: game.completed_today ? 'rgba(200,155,60,0.08)' : 'var(--bg2)',
      }}
    >
      {dragHandle}

      <button
        onClick={() => onToggleComplete(game.game_id, !game.completed_today)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors border-zinc-600 bg-transparent"
        style={game.completed_today ? { borderColor: '#c8913c', background: '#c8913c', color: '#1a140a' } : undefined}
        aria-label={game.completed_today ? 'Mark incomplete' : 'Mark complete'}
      >
        {game.completed_today && (
          <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none">
            <path d="M2 7l4 4 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <img
        src={iconSrc ?? gameIconSrc(game.icon_name)}
        alt=""
        width={34}
        height={34}
        className={`shrink-0 rounded-lg object-cover transition-opacity ${game.completed_today ? 'opacity-40' : ''}`}
        onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/placeholder.svg'; }}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`truncate text-sm font-medium leading-snug ${game.completed_today ? 'text-zinc-400 line-through' : 'text-white'}`}>
          {game.name}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-zinc-500">{displayServer(game.server)}</span>
          {onUpdateOffset && (
            <select
              value={game.custom_reminder_offset ?? 0}
              onChange={e => onUpdateOffset(game.game_id, parseInt(e.target.value, 10))}
              onClick={e => e.stopPropagation()}
              disabled={hookNotificationsActive}
              title={hookNotificationsActive ? 'Reminder overridden by play window notification' : undefined}
              className="rounded px-1 py-px text-xs outline-none"
              style={{
                border: '1px solid rgba(200,155,60,0.15)',
                background: 'var(--surface)',
                color: hookNotificationsActive ? 'var(--text3)' : 'var(--text2)',
                opacity: hookNotificationsActive ? 0.45 : 1,
                cursor: hookNotificationsActive ? 'not-allowed' : 'default',
              }}
              onFocus={e => { if (!hookNotificationsActive) e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)'; }}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.15)')}
            >
              {OFFSET_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {game.completed_today ? (
          <span className="text-xs font-medium" style={{ color: 'var(--gold-bright)' }}>Done</span>
        ) : (
          <>
            <CountdownTimer timezone={game.timezone} dailyReset={game.daily_reset} />
            <span className="text-xs text-zinc-600">resets {resetAt}</span>
          </>
        )}
      </div>

      {onSchedule && (
        <button
          onClick={() => onSchedule(game)}
          title={hasSchedule ? 'Edit play schedule' : 'Set play schedule'}
          className="relative shrink-0 rounded p-1 transition-colors"
          style={{ color: hasSchedule ? 'var(--gold-dim)' : 'var(--text3)' }}
          aria-label="Schedule game"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M5 1v3M11 1v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M2 7h12" stroke="currentColor" strokeWidth="1.4" />
            <rect x="4.5" y="9" width="2" height="2" rx="0.4" fill="currentColor" />
            <rect x="9.5" y="9" width="2" height="2" rx="0.4" fill={hasSchedule ? '#c8913c' : 'currentColor'} />
          </svg>
          {hasSchedule && (
            <span
              className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--gold)' }}
            />
          )}
        </button>
      )}

      <button
        onClick={() => onRemove(game.game_id)}
        className="ml-1 shrink-0 text-zinc-600 transition-colors hover:text-red-400"
        aria-label="Remove game"
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
