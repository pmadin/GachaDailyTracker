'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { useAuth } from '../_context/AuthContext';
import { hasBrowserPushSubscription } from '../_lib/push';
import {
  fetchTrackerGames,
  removeTrackerGame,
  markComplete,
  unmarkComplete,
  bulkAddGames,
  saveGameOrder,
  checkStreak,
  updateGameReminderOffset,
  fetchNotificationPrefs,
  fetchSchedules,
} from '../_lib/api';
import type { Schedule } from '../_lib/api';
import ScheduleModal from '../_components/ScheduleModal';
import type { ScheduleFormData } from '../_components/ScheduleModal';
import {
  getAnonGames,
  getAnonGameIds,
  markAnonComplete,
  unmarkAnonComplete,
  removeAnonGame,
  clearAnonGames,
  getAnonStreak,
  updateAnonStreak,
} from '../_lib/storage';
import DashboardCard from '../_components/DashboardCard';
import SortableCard from '../_components/SortableCard';
import type { DashboardGame } from '../_components/DashboardCard';
import { getNextResetMs } from '../_lib/countdown';

export default function DashboardPage() {
  const { token, isLoading: authLoading } = useAuth();
  const [games, setGames] = useState<DashboardGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [streak, setStreak] = useState(0);
  const [sortBy, setSortBy] = useState<'reset' | 'alpha' | 'custom'>('reset');
  const [customOrder, setCustomOrder] = useState<number[]>([]);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [scheduleMap, setScheduleMap] = useState<Map<number, ScheduleFormData>>(new Map());
  const [scheduleModalGame, setScheduleModalGame] = useState<DashboardGame | null>(null);

  useEffect(() => {
    try {
      const savedOrder = localStorage.getItem('gdt_order');
      if (savedOrder) setCustomOrder(JSON.parse(savedOrder));
      const savedSort = localStorage.getItem('gdt_sort');
      if (savedSort === 'reset' || savedSort === 'alpha' || savedSort === 'custom') {
        setSortBy(savedSort);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    localStorage.setItem('gdt_sort', sortBy);
  }, [sortBy]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const loadGames = useCallback(async () => {
    setLoading(true);
    try {
      if (token) {
        const res = await fetchTrackerGames(token);
        setGames(res.games.map(g => ({
          game_id: g.game_id,
          name: g.name,
          server: g.server,
          timezone: g.timezone,
          daily_reset: g.daily_reset,
          icon_name: g.icon_name,
          completed_today: g.completed_today,
          custom_reminder_offset: g.custom_reminder_offset ?? 0,
        })));
        setStreak(res.streak ?? 0);
        // Seed custom order from DB if localStorage has nothing saved yet
        const savedOrder = (() => { try { return JSON.parse(localStorage.getItem('gdt_order') ?? 'null'); } catch { return null; } })();
        if (!savedOrder) {
          const dbOrder = res.games
            .slice()
            .sort((a, b) => a.display_order - b.display_order)
            .map(g => g.game_id);
          setCustomOrder(dbOrder);
          localStorage.setItem('gdt_order', JSON.stringify(dbOrder));
        }
      } else {
        const entries = getAnonGames();
        setGames(entries.map(({ game, completedDate }) => ({
          game_id: game.id,
          name: game.name,
          server: game.server,
          timezone: game.timezone,
          daily_reset: game.daily_reset,
          icon_name: game.icon_name,
          completed_today: completedDate === new Date().toISOString().split('T')[0],
        })));
        setStreak(getAnonStreak());
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchSchedules(token)
      .then(r => {
        const map = new Map<number, ScheduleFormData>();
        r.schedules.forEach((s: Schedule) => {
          map.set(s.game_id, {
            days_of_week: s.days_of_week,
            window_start: s.window_start,
            window_end: s.window_end,
            hook_notifications: s.hook_notifications,
          });
        });
        setScheduleMap(map);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchNotificationPrefs(token)
      .then(async p => {
        if (!p.enabled) { setNotifEnabled(false); return; }
        setNotifEnabled(await hasBrowserPushSubscription());
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (authLoading) return;
    // Fallback: if logged in and anon games still in localStorage, try bulk-sync
    if (token) {
      const pendingIds = getAnonGameIds();
      if (pendingIds.length > 0) {
        bulkAddGames(token, pendingIds)
          .then(() => clearAnonGames())
          .catch(() => {});
      }
    }
    loadGames();
  }, [authLoading, token, loadGames]);

  const done = games.filter(g => g.completed_today).length;
  const total = games.length;

  const handleToggleComplete = async (gameId: number, completed: boolean) => {
    setGames(prev =>
      prev.map(g => g.game_id === gameId ? { ...g, completed_today: completed } : g)
    );
    if (token) {
      completed ? await markComplete(token, gameId) : await unmarkComplete(token, gameId);
    } else {
      completed ? markAnonComplete(gameId) : unmarkAnonComplete(gameId);
    }

    // Only trigger streak + confetti when user actively marks the last game complete
    if (completed) {
      const wasAlreadyDone = games.find(g => g.game_id === gameId)?.completed_today ?? false;
      const previousDone = games.filter(g => g.completed_today).length;
      const isNowAllDone = !wasAlreadyDone && previousDone + 1 === games.length && games.length > 0;

      if (isNowAllDone) {
        if (token) {
          checkStreak(token).then(r => setStreak(r.streak)).catch(() => {});
        } else {
          setStreak(updateAnonStreak());
        }

        const todayStr = new Date().toISOString().split('T')[0];
        if (localStorage.getItem('gdt_confetti_date') !== todayStr) {
          localStorage.setItem('gdt_confetti_date', todayStr);
          import('canvas-confetti').then(m => {
            m.default({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
          });
        }
      }
    }
  };

  const handleClearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    const ids = games.map(g => g.game_id);
    setGames([]);
    setConfirmClear(false);
    if (token) {
      await Promise.all(ids.map(id => removeTrackerGame(token, id).catch(() => {})));
    } else {
      clearAnonGames();
    }
  };

  const handleSchedule = useCallback((game: DashboardGame) => {
    setScheduleModalGame(game);
  }, []);

  const handleScheduleSave = useCallback((data: ScheduleFormData & { game_id: number }) => {
    setScheduleMap(prev => {
      const next = new Map(prev);
      next.set(data.game_id, {
        days_of_week: data.days_of_week,
        window_start: data.window_start,
        window_end: data.window_end,
        hook_notifications: data.hook_notifications,
      });
      return next;
    });
    setScheduleModalGame(null);
  }, []);

  const handleScheduleDelete = useCallback(() => {
    if (scheduleModalGame) {
      setScheduleMap(prev => {
        const next = new Map(prev);
        next.delete(scheduleModalGame.game_id);
        return next;
      });
    }
    setScheduleModalGame(null);
  }, [scheduleModalGame]);

  const handleUpdateOffset = useCallback(async (gameId: number, offset: number) => {
    setGames(prev => prev.map(g => g.game_id === gameId ? { ...g, custom_reminder_offset: offset } : g));
    if (token) {
      updateGameReminderOffset(token, gameId, offset).catch(() => {});
    }
  }, [token]);

  const handleRemove = async (gameId: number) => {
    setGames(prev => prev.filter(g => g.game_id !== gameId));
    if (token) {
      await removeTrackerGame(token, gameId);
    } else {
      removeAnonGame(gameId);
    }
  };

  const sortedGames = useMemo(() => {
    if (sortBy === 'custom') {
      const orderMap = new Map(customOrder.map((id, i) => [id, i]));
      return games.slice().sort((a, b) => {
        const ai = orderMap.has(a.game_id) ? orderMap.get(a.game_id)! : 9999;
        const bi = orderMap.has(b.game_id) ? orderMap.get(b.game_id)! : 9999;
        return ai - bi;
      });
    }
    return games.slice().sort((a, b) => {
      if (a.completed_today !== b.completed_today)
        return Number(a.completed_today) - Number(b.completed_today);
      if (sortBy === 'alpha')
        return a.name.localeCompare(b.name);
      return getNextResetMs(a.timezone, a.daily_reset) - getNextResetMs(b.timezone, b.daily_reset);
    });
  }, [games, sortBy, customOrder]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedGames.findIndex(g => g.game_id === active.id);
    const newIndex = sortedGames.findIndex(g => g.game_id === over.id);
    const newOrder = arrayMove(sortedGames, oldIndex, newIndex).map(g => g.game_id);
    setCustomOrder(newOrder);
    localStorage.setItem('gdt_order', JSON.stringify(newOrder));
    if (token) {
      const orders = newOrder.map((game_id, order_index) => ({ game_id, order_index }));
      saveGameOrder(token, orders).catch(() => {});
    }
  }, [sortedGames, token]);

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header: title + button stubs */}
        <div className="mb-4 flex items-center justify-between">
          <div className="animate-pulse rounded" style={{ width: 96, height: 28, background: 'var(--surface)' }} />
          <div className="flex gap-2">
            <div className="animate-pulse rounded-lg" style={{ width: 76, height: 32, background: 'var(--surface)' }} />
            <div className="animate-pulse rounded-lg" style={{ width: 100, height: 32, background: 'var(--surface)' }} />
          </div>
        </div>
        {/* Sort tabs */}
        <div className="mb-5 flex gap-2">
          <div className="animate-pulse rounded-lg" style={{ width: 84, height: 28, background: 'var(--surface)' }} />
          <div className="animate-pulse rounded-lg" style={{ width: 48, height: 28, background: 'var(--surface)' }} />
          <div className="animate-pulse rounded-lg" style={{ width: 64, height: 28, background: 'var(--surface)' }} />
        </div>
        {/* Progress bar */}
        <div className="animate-pulse mb-5 rounded-xl" style={{ height: 32, background: 'var(--surface)' }} />
        {/* Game card rows */}
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse flex items-center gap-3 rounded-xl px-3 py-3"
              style={{ background: 'var(--surface)' }}
            >
              <div className="h-6 w-6 shrink-0 rounded-full" style={{ background: 'var(--surface2)' }} />
              <div className="h-9 w-9 shrink-0 rounded-lg" style={{ background: 'var(--surface2)' }} />
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="rounded" style={{ width: '52%', height: 12, background: 'var(--surface2)' }} />
                <div className="rounded" style={{ width: '32%', height: 10, background: 'var(--surface2)' }} />
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="rounded" style={{ width: 58, height: 12, background: 'var(--surface2)' }} />
                <div className="rounded" style={{ width: 70, height: 10, background: 'var(--surface2)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">My List</h1>
            {streak > 0 && (
              <span className="flex items-center gap-1 text-sm font-semibold text-orange-400">
                <svg width="13" height="15" viewBox="0 0 13 15" fill="none" className="flex-shrink-0">
                  <path
                    d="M6.5 1C4 4 3 7 3.5 9.5C2 8 2 6.5 2.5 5.5C1.5 7 1 9 1 10.5C1 12.7 3.5 14.5 6.5 14.5C9.5 14.5 12 12.7 12 10.5C12 9 11.5 7 10.5 5.5C11 6.5 11 8 9.5 9.5C10 7 9 4 6.5 1Z"
                    fill="currentColor"
                  />
                  <path
                    d="M6.5 7C5.5 8 5 9.5 5.5 11.5C5 11 4.5 9.5 5 8.5C5.5 8 6 7.5 6.5 7Z"
                    fill="#fed7aa"
                    opacity="0.7"
                  />
                </svg>
                {streak}
              </span>
            )}
          </div>
          {total > 0 && (
            <div className="mt-2 flex items-center gap-1">
              <button
                onClick={() => setSortBy('reset')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  sortBy === 'reset'
                    ? 'bg-[rgba(200,155,60,0.15)] text-[#e8c86a] border border-[rgba(200,155,60,0.3)]'
                    : 'bg-[#18140d] text-[#4a3d2a] hover:bg-[#1e190f] hover:text-[#9a8570]'
                }`}
              >
                Reset time
              </button>
              <button
                onClick={() => setSortBy('alpha')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  sortBy === 'alpha'
                    ? 'bg-[rgba(200,155,60,0.15)] text-[#e8c86a] border border-[rgba(200,155,60,0.3)]'
                    : 'bg-[#18140d] text-[#4a3d2a] hover:bg-[#1e190f] hover:text-[#9a8570]'
                }`}
              >
                A–Z
              </button>
              <button
                onClick={() => {
                  if (sortBy !== 'custom' && customOrder.length === 0) {
                    setCustomOrder(sortedGames.map(g => g.game_id));
                  }
                  setSortBy('custom');
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  sortBy === 'custom'
                    ? 'bg-[rgba(200,155,60,0.15)] text-[#e8c86a] border border-[rgba(200,155,60,0.3)]'
                    : 'bg-[#18140d] text-[#4a3d2a] hover:bg-[#1e190f] hover:text-[#9a8570]'
                }`}
              >
                Custom
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <button
              onClick={handleClearAll}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                confirmClear
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'border border-[rgba(200,155,60,0.15)] text-[#4a3d2a] hover:border-red-800 hover:text-red-400'
              }`}
            >
              {confirmClear ? 'Confirm clear?' : 'Clear all'}
            </button>
          )}
          <Link
            href="/games"
            className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
          >
            + Add games
          </Link>
        </div>
      </div>

      {games.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <p className="text-zinc-400">Your list is empty.</p>
          <Link
            href="/games"
            className="rounded-lg px-5 py-2 text-sm font-medium transition-colors hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
          >
            Browse games
          </Link>
        </div>
      ) : (
        <>
          {total > 0 && (
            <div className="relative mb-4 h-6 w-full overflow-hidden rounded-full bg-[#18140d]">
              <div
                className="progress-gold h-full rounded-full transition-all duration-300"
                style={{ width: `${(done / total) * 100}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white drop-shadow-sm">
                {done}/{total}
              </span>
            </div>
          )}
          {sortBy === 'custom' ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sortedGames.map(g => g.game_id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">
                  {sortedGames.map(game => (
                    <SortableCard
                      key={game.game_id}
                      game={game}
                      onToggleComplete={handleToggleComplete}
                      onRemove={handleRemove}
                      onUpdateOffset={notifEnabled ? handleUpdateOffset : undefined}
                      onSchedule={token ? handleSchedule : undefined}
                      hasSchedule={scheduleMap.has(game.game_id)}
                      hookNotificationsActive={scheduleMap.get(game.game_id)?.hook_notifications === true}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="flex flex-col gap-2">
              {sortedGames.map(game => (
                <DashboardCard
                  key={game.game_id}
                  game={game}
                  onToggleComplete={handleToggleComplete}
                  onRemove={handleRemove}
                  onUpdateOffset={notifEnabled ? handleUpdateOffset : undefined}
                  onSchedule={token ? handleSchedule : undefined}
                  hasSchedule={scheduleMap.has(game.game_id)}
                  hookNotificationsActive={scheduleMap.get(game.game_id)?.hook_notifications === true}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>

    {scheduleModalGame && token && (
      <ScheduleModal
        game={{
          game_id: scheduleModalGame.game_id,
          game_name: scheduleModalGame.name,
          server: scheduleModalGame.server,
        }}
        existingSchedule={scheduleMap.get(scheduleModalGame.game_id) ?? null}
        token={token}
        onSave={handleScheduleSave}
        onDelete={handleScheduleDelete}
        onClose={() => setScheduleModalGame(null)}
      />
    )}
    </>
  );
}
