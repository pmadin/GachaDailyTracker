'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  fetchTrackerGames,
  fetchPopularGames,
  fetchGames,
  markComplete,
  unmarkComplete,
  addTrackerGame,
  checkStreak,
  fetchProfile,
  fetchSchedules,
} from './_lib/api';
import type { PopularGame, Schedule } from './_lib/api';
import {
  getAnonGames,
  markAnonComplete,
  unmarkAnonComplete,
  addAnonGame,
  updateAnonStreak,
} from './_lib/storage';
import { useAuth } from './_context/AuthContext';
import MarketingHero from './_components/MarketingHero';
import EmptyDashboard from './_components/EmptyDashboard';
import GamesTray, { type TrayGame } from './_components/GamesTray';
import PopularGames from './_components/PopularGames';
import FeaturesSection from './_components/FeaturesSection';
import StatusRow from './_components/home/StatusRow';
import TodayPlan from './_components/home/TodayPlan';
import SetupChecklist from './_components/home/SetupChecklist';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function HomePage() {
  const { token, isLoading: authLoading } = useAuth();
  const [myGames, setMyGames] = useState<TrayGame[]>([]);
  const [popular, setPopular] = useState<PopularGame[]>([]);
  const [myGamesLoading, setMyGamesLoading] = useState(true);
  // Signed-in only
  const [streak, setStreak] = useState(0);
  const [streakBest, setStreakBest] = useState<number | null>(null);
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (token) {
      fetchTrackerGames(token)
        .then(res => {
          setStreak(res.streak ?? 0);
          setMyGames(res.games.map(g => ({
            id: g.game_id,
            name: g.name,
            icon_name: g.icon_name,
            server: g.server,
            timezone: g.timezone,
            daily_reset: g.daily_reset,
            done: g.completed_today,
          })));
        })
        .catch(() => setMyGames([]))
        .finally(() => setMyGamesLoading(false));
      fetchProfile(token)
        .then(({ user }) => setStreakBest(user.streak_best))
        .catch(() => {});
      fetchSchedules(token)
        .then(res => setSchedules(res.schedules))
        .catch(() => setSchedules([]));
    } else {
      const anon = getAnonGames();
      setMyGames(anon.map(e => ({
        id: e.game.id,
        name: e.game.name,
        icon_name: e.game.icon_name,
        server: e.game.server,
        timezone: e.game.timezone,
        daily_reset: e.game.daily_reset,
        done: e.completedDate === todayISO(),
      })));
      setMyGamesLoading(false);
    }
  }, [token, authLoading]);

  useEffect(() => {
    // Over-fetch so signed-in users still get ~10 rows after their tracked games are filtered out.
    fetchPopularGames(20)
      .then(res => setPopular(res.games))
      .catch(() => setPopular([]));
  }, []);

  const handleToggle = useCallback(async (gameId: number, done: boolean) => {
    if (token) {
      if (done) {
        await unmarkComplete(token, gameId);
      } else {
        await markComplete(token, gameId);
      }
    } else {
      if (done) {
        unmarkAnonComplete(gameId);
      } else {
        markAnonComplete(gameId);
      }
    }
    setMyGames(prev => prev.map(g => g.id === gameId ? { ...g, done: !done } : g));

    // Trigger streak + confetti when this toggle completes the last game
    if (!done) {
      const currentDone = myGames.filter(g => g.done).length;
      const isNowAllDone = currentDone + 1 === myGames.length && myGames.length > 0;
      if (isNowAllDone) {
        if (token) {
          checkStreak(token)
            .then(res => {
              setStreak(res.streak);
              setStreakBest(prev => Math.max(prev ?? 0, res.streak));
            })
            .catch(() => {});
        } else {
          updateAnonStreak();
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
  }, [token, myGames]);

  const handleAddPopular = useCallback(async (game: PopularGame) => {
    if (token) {
      await addTrackerGame(token, game.id);
      const res = await fetchTrackerGames(token);
      setMyGames(res.games.map(g => ({
        id: g.game_id,
        name: g.name,
        icon_name: g.icon_name,
        server: g.server,
        timezone: g.timezone,
        daily_reset: g.daily_reset,
        done: g.completed_today,
      })));
    } else {
      // Fetch full game data (PopularGame lacks timezone/daily_reset)
      try {
        const res = await fetchGames({ search: game.name, limit: 10 });
        const fullGame = res.games.find(g => g.id === game.id);
        if (fullGame) {
          addAnonGame(fullGame);
          setMyGames(prev => [...prev, {
            id: fullGame.id,
            name: fullGame.name,
            icon_name: fullGame.icon_name,
            server: fullGame.server,
            timezone: fullGame.timezone,
            daily_reset: fullGame.daily_reset,
            done: false,
          }]);
        }
      } catch {
        // silently fail — user can still add via /games
      }
    }
  }, [token]);

  const trackedIds = new Set(myGames.map(g => g.id));
  const isLoggedIn = !!token;
  const hasGames = myGames.length > 0;
  const loading = authLoading || myGamesLoading;

  const popContext: 'logged-out' | 'empty' | 'has-games' | 'personal' =
    isLoggedIn ? 'personal' : hasGames ? 'has-games' : 'logged-out';
  // Signed-in users only see games they don't already track; anon keeps the full top 10.
  // Same rule as GET /schedule/today (an empty days_of_week means every day), using the browser's day.
  const todayDow = new Date().getDay();
  const todaySchedule = schedules?.filter(s => s.days_of_week.length === 0 || s.days_of_week.includes(todayDow)) ?? null;
  const popularShown = (isLoggedIn ? popular.filter(g => !trackedIds.has(g.id)) : popular).slice(0, 10);

  return (
    <>
      {/* State-dependent top section:
          - loading         → skeleton (reserves height, prevents CLS)
          - anon, no games  → MarketingHero
          - anon, has games → GamesTray (anon localStorage games)
          - auth            → StatusRow + (GamesTray + TodayPlan | EmptyDashboard) + SetupChecklist */}
      {loading ? (
        <div className="mx-auto max-w-6xl px-4 pt-8 pb-2" style={{ minHeight: 220 }}>
          {/* Status row (signed-in only) */}
          {token && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" style={{ marginBottom: 28 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse" style={{ height: 118, borderRadius: 12, background: 'var(--surface)' }} />
              ))}
            </div>
          )}
          {/* Progress bar row */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="animate-pulse rounded" style={{ width: 110, height: 11, background: 'var(--surface)' }} />
              <div className="animate-pulse rounded" style={{ width: 56, height: 11, background: 'var(--surface)' }} />
            </div>
            <div className="animate-pulse rounded" style={{ height: 4, background: 'var(--surface)' }} />
          </div>
          {/* "My Games" header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="animate-pulse rounded" style={{ width: 84, height: 18, background: 'var(--surface)' }} />
            <div className="animate-pulse rounded" style={{ width: 50, height: 12, background: 'var(--surface)' }} />
          </div>
          {/* Card row */}
          <div style={{ display: 'flex', gap: 10, overflow: 'hidden' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse"
                style={{ width: 110, minWidth: 110, height: 168, borderRadius: 12, background: 'var(--surface)', flexShrink: 0 }}
              />
            ))}
          </div>
        </div>
      ) : isLoggedIn ? (
        <div className="mx-auto max-w-6xl px-4 pt-8 pb-2">
          <StatusRow games={myGames} streak={streak} streakBest={streakBest} />
          {hasGames ? <GamesTray games={myGames} onToggle={handleToggle} hideProgress /> : <EmptyDashboard />}
          {hasGames && <TodayPlan schedules={todaySchedule} hasAnySchedule={!!schedules?.length} />}
          <SetupChecklist token={token} hasSchedule={schedules === null ? null : schedules.length > 0} />
        </div>
      ) : hasGames ? (
        <div className="mx-auto max-w-6xl px-4 pt-8 pb-2">
          <GamesTray games={myGames} onToggle={handleToggle} />
        </div>
      ) : (
        <MarketingHero />
      )}

      {/* Popular games */}
      {popularShown.length > 0 && (
        <div className="mx-auto max-w-6xl px-4 py-10">
          <PopularGames
            games={popularShown}
            context={popContext}
            trackedIds={trackedIds}
            onAdd={handleAddPopular}
          />
        </div>
      )}

      {/* Features / about section: it's a sign-up pitch, so signed-in users skip it */}
      {!isLoggedIn && !authLoading && (
        <div className="mx-auto max-w-6xl px-4 pb-16">
          <FeaturesSection />
        </div>
      )}
    </>
  );
}
