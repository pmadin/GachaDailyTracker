'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../_context/AuthContext';
import { fetchSchedules, fetchTrackerGames } from '../_lib/api';
import type { Schedule, TrackedGame } from '../_lib/api';
import ScheduleModal from '../_components/ScheduleModal';
import type { ScheduleFormData } from '../_components/ScheduleModal';
import { displayServer } from '../_lib/servers';
import { getLocalResetTime } from '../_lib/countdown';
import { timeToMinutes, formatTime, isWindowActive } from '../_lib/scheduleTime';

type View = 'day' | 'week' | 'month';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const SLOT_PX = 40;   // px per 30-min slot
const HOUR_PX = SLOT_PX * 2;
const TOTAL_HEIGHT = 48 * SLOT_PX;
const LABEL_WIDTH = 64;

interface LayoutItem {
  schedule: Schedule;
  topPx: number;
  heightPx: number;
  lane: number;
  totalLanes: number;
}

function layoutSchedules(schedules: Schedule[]): LayoutItem[] {
  const sorted = [...schedules].sort(
    (a, b) => timeToMinutes(a.window_start) - timeToMinutes(b.window_start)
  );
  const laneEnds: number[] = [];
  const items = sorted.map(s => {
    const startMin = timeToMinutes(s.window_start);
    const endMin = timeToMinutes(s.window_end);
    let lane = laneEnds.findIndex(e => e <= startMin);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(endMin); }
    else { laneEnds[lane] = endMin; }
    return {
      schedule: s,
      topPx: Math.round((startMin / 30) * SLOT_PX),
      heightPx: Math.max(Math.round(((endMin - startMin) / 30) * SLOT_PX), SLOT_PX),
      lane,
    };
  });
  const totalLanes = Math.max(laneEnds.length, 1);
  return items.map(item => ({ ...item, totalLanes }));
}

function daysLabel(days: number[]): string {
  if (days.length === 0 || days.length === 7) return 'Every day';
  if (days.length === 5 && !days.includes(0) && !days.includes(6)) return 'Weekdays';
  if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends';
  return days.map(d => DAY_SHORT[d]).join(', ');
}

export default function SchedulePage() {
  const { token, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [view, setView] = useState<View>('day');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [trackedGames, setTrackedGames] = useState<TrackedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<{ game_id: number; game_name: string; server: string } | null>(null);
  const [calendarDate, setCalendarDate] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedCalDay, setSelectedCalDay] = useState<{ day: number; dow: number } | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      router.push('/login');
      return;
    }
    Promise.all([fetchSchedules(token), fetchTrackerGames(token)])
      .then(([schRes, trRes]) => {
        setSchedules(schRes.schedules);
        setTrackedGames(trRes.games);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authLoading, token, router]);

  // Scroll to current hour in day view
  useEffect(() => {
    if (view !== 'day' || !timelineRef.current) return;
    const now = new Date();
    const scrollTo = (now.getHours() - 1) * HOUR_PX;
    timelineRef.current.scrollTop = Math.max(0, scrollTo);
  }, [view, loading]);

  const scheduleMap = useMemo(
    () => new Map(schedules.map(s => [s.game_id, s])),
    [schedules]
  );

  const completionMap = useMemo(
    () => new Map(trackedGames.map(g => [g.game_id, g.completed_today])),
    [trackedGames]
  );

  const now = new Date();
  const todayDow = now.getDay();

  const todaySchedules = useMemo(
    () => schedules
      .filter(s => s.days_of_week.length === 0 || s.days_of_week.includes(todayDow))
      .sort((a, b) => a.window_start.localeCompare(b.window_start)),
    [schedules, todayDow]
  );

  const unscheduledGames = useMemo(
    () => trackedGames.filter(g => !scheduleMap.has(g.game_id)),
    [trackedGames, scheduleMap]
  );

  function openModal(game: { game_id: number; game_name: string; server: string }) {
    setSelectedGame(game);
  }

  function refreshSchedules() {
    if (!token) return;
    fetchSchedules(token).then(r => setSchedules(r.schedules)).catch(() => {});
  }

  const existingScheduleData: ScheduleFormData | null = selectedGame
    ? (() => {
        const s = scheduleMap.get(selectedGame.game_id);
        if (!s) return null;
        return {
          days_of_week: s.days_of_week,
          window_start: s.window_start,
          window_end: s.window_end,
          hook_notifications: s.hook_notifications,
        };
      })()
    : null;

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header: title + Day/Week/Month tabs */}
        <div className="mb-6 flex items-center justify-between">
          <div className="animate-pulse rounded" style={{ width: 100, height: 28, background: 'var(--surface)' }} />
          <div className="flex gap-1 rounded-lg p-0.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {[84, 68, 80].map((w, i) => (
              <div key={i} className="animate-pulse rounded-md" style={{ width: w, height: 32, background: 'var(--surface2)' }} />
            ))}
          </div>
        </div>
        {/* Today label stub */}
        <div className="mb-4 animate-pulse rounded" style={{ width: 220, height: 14, background: 'var(--surface)' }} />
        {/* Timeline block */}
        <div className="animate-pulse overflow-hidden rounded-xl" style={{ height: 'calc(100vh - 280px)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {/* Hour lines */}
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ position: 'absolute', top: `${(i + 1) * 14}%`, left: 64, right: 0, height: 1, background: 'var(--border)' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Schedule</h1>
        <div
          className="flex rounded-lg p-0.5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {(['day', 'week', 'month'] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="rounded-md px-6 py-2 text-base font-medium capitalize transition-colors"
              style={{
                background: view === v ? 'linear-gradient(135deg, #c8913c, #e8c86a)' : 'transparent',
                color: view === v ? '#0a0808' : 'var(--text3)',
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Day View ─── */}
      {view === 'day' && (
        <div>
          <p className="mb-4 text-base font-medium" style={{ color: 'var(--text2)' }}>
            Today — {DAY_NAMES[todayDow]}, {MONTH_NAMES[now.getMonth()]} {now.getDate()}
          </p>

          {todaySchedules.length === 0 ? (
            <div
              className="flex items-center justify-center rounded-xl py-16 text-sm"
              style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text3)' }}
            >
              No games scheduled for today
            </div>
          ) : (
            <div
              ref={timelineRef}
              className="overflow-y-auto rounded-xl schedule-timeline"
              style={{
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                maxHeight: 'calc(100vh - 240px)',
              }}
            >
              <div style={{ display: 'flex', height: TOTAL_HEIGHT }}>
                {/* Hour labels column */}
                <div style={{ width: LABEL_WIDTH, flexShrink: 0, position: 'relative' }}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <div
                      key={h}
                      style={{
                        position: 'absolute',
                        top: h * HOUR_PX,
                        left: 0,
                        width: '100%',
                        height: HOUR_PX,
                        display: 'flex',
                        alignItems: 'flex-start',
                        paddingTop: 6,
                        paddingLeft: 10,
                        fontSize: 12,
                        color: 'var(--text3)',
                        borderTop: h > 0 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                    </div>
                  ))}
                </div>

                {/* Game area — position:relative so absolute children are contained */}
                <div style={{ flex: 1, position: 'relative' }}>
                  {/* Hour divider lines */}
                  {Array.from({ length: 24 }, (_, h) => (
                    <div
                      key={`line-${h}`}
                      style={{
                        position: 'absolute',
                        top: h * HOUR_PX,
                        left: 0,
                        right: 0,
                        borderTop: h > 0 ? '1px solid var(--border)' : 'none',
                      }}
                    />
                  ))}

                  {/* Current time indicator */}
                  {(() => {
                    const nowTop = Math.round(
                      ((now.getHours() * 60 + now.getMinutes()) / 30) * SLOT_PX
                    );
                    return (
                      <div
                        style={{
                          position: 'absolute',
                          top: nowTop,
                          left: 0,
                          right: 0,
                          borderTop: '2px solid rgba(200,155,60,0.6)',
                          zIndex: 5,
                          pointerEvents: 'none',
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            left: 4,
                            top: -10,
                            fontSize: 11,
                            color: 'var(--gold)',
                            background: 'var(--bg2)',
                            paddingRight: 4,
                          }}
                        >
                          now
                        </span>
                      </div>
                    );
                  })()}

                  {/* Game blocks — overlapping windows get side-by-side lanes */}
                  {layoutSchedules(todaySchedules).map(({ schedule: s, topPx, heightPx, lane, totalLanes }) => {
                    const active = isWindowActive(s.window_start, s.window_end);
                    const done = completionMap.get(s.game_id) ?? false;
                    return (
                      <button
                        key={s.game_id}
                        onClick={() => openModal({ game_id: s.game_id, game_name: s.game_name, server: s.server })}
                        style={{
                          position: 'absolute',
                          top: topPx + 3,
                          height: Math.max(heightPx - 6, SLOT_PX - 6),
                          left: `calc(${(lane / totalLanes) * 100}% + 4px)`,
                          width: `calc(${100 / totalLanes}% - 8px)`,
                          borderRadius: 10,
                          padding: '8px 12px',
                          textAlign: 'left',
                          opacity: done ? 0.45 : 1,
                          background: active ? 'rgba(200,155,60,0.18)' : 'rgba(200,155,60,0.06)',
                          border: `1px solid ${active ? 'rgba(200,155,60,0.5)' : 'rgba(200,155,60,0.15)'}`,
                          zIndex: 3,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          className="truncate text-sm font-semibold"
                          style={{ color: 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}
                        >
                          {s.game_name}
                        </div>
                        <div className="truncate text-xs" style={{ color: 'var(--text2)' }}>
                          {formatTime(s.window_start)}–{formatTime(s.window_end)} · {displayServer(s.server)}
                        </div>
                        {s.game_timezone && (
                          <div className="truncate text-xs" style={{ color: 'var(--text3)', opacity: 0.8 }}>
                            resets {getLocalResetTime(s.game_timezone, s.daily_reset)}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Unscheduled tracked games */}
          {unscheduledGames.length > 0 && (
            <div className="mt-6">
              <p className="mb-3 text-xs uppercase tracking-wide" style={{ color: 'var(--text3)' }}>
                Tracked but not scheduled
              </p>
              <div className="flex flex-wrap gap-2">
                {unscheduledGames.map(g => (
                  <button
                    key={g.game_id}
                    onClick={() => openModal({ game_id: g.game_id, game_name: g.name, server: g.server })}
                    className="rounded-lg px-3 py-1.5 text-sm transition-colors"
                    style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--border2)';
                      e.currentTarget.style.color = 'var(--text)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.color = 'var(--text2)';
                    }}
                  >
                    + {g.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Week View ─── */}
      {view === 'week' && (
        <div>
          <div
            className="grid gap-px overflow-hidden rounded-xl"
            style={{
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              background: 'var(--border)',
              border: '1px solid var(--border)',
            }}
          >
            {DAY_SHORT.map((dayName, dow) => {
              const isToday = dow === todayDow;
              const daySchedules = schedules
                .filter(s => s.days_of_week.length === 0 || s.days_of_week.includes(dow))
                .sort((a, b) => a.window_start.localeCompare(b.window_start));

              return (
                <div
                  key={dow}
                  className="flex flex-col gap-1.5 p-2"
                  style={{
                    background: isToday ? 'rgba(200,155,60,0.06)' : 'var(--bg2)',
                    borderLeft: isToday ? '2px solid rgba(200,155,60,0.4)' : undefined,
                    minHeight: 180,
                  }}
                >
                  <div
                    className="mb-1 text-center text-xs font-semibold"
                    style={{ color: isToday ? 'var(--gold)' : 'var(--text3)' }}
                  >
                    {dayName}
                    {isToday && <span className="ml-1">✦</span>}
                  </div>
                  {daySchedules.map(s => (
                    <button
                      key={s.game_id}
                      onClick={() => openModal({ game_id: s.game_id, game_name: s.game_name, server: s.server })}
                      className="w-full rounded-md px-1.5 py-1 text-left transition-colors"
                      style={{
                        background: 'rgba(200,155,60,0.08)',
                        border: '1px solid rgba(200,155,60,0.12)',
                        opacity: (completionMap.get(s.game_id) && dow === todayDow) ? 0.5 : 1,
                      }}
                    >
                      <div className="truncate text-xs font-medium" style={{ color: 'var(--text)' }}>
                        {s.game_name}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--text3)' }}>
                        {formatTime(s.window_start)}–{formatTime(s.window_end)}
                      </div>
                    </button>
                  ))}
                  {daySchedules.length === 0 && (
                    <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--text3)', opacity: 0.4 }}>
                      —
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {schedules.length === 0 && (
            <p className="mt-4 text-center text-sm" style={{ color: 'var(--text3)' }}>
              No schedules set yet. Add one from the Day view.
            </p>
          )}
        </div>
      )}

      {/* ─── Month View ─── */}
      {view === 'month' && (
        <div>
          {/* Calendar header */}
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => setCalendarDate(prev => {
                const d = new Date(prev.year, prev.month - 1, 1);
                return { year: d.getFullYear(), month: d.getMonth() };
              })}
              className="rounded-lg px-3 py-1.5 text-sm transition-colors"
              style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}
            >
              ‹
            </button>
            <span className="font-semibold" style={{ color: 'var(--text)' }}>
              {MONTH_NAMES[calendarDate.month]} {calendarDate.year}
            </span>
            <button
              onClick={() => setCalendarDate(prev => {
                const d = new Date(prev.year, prev.month + 1, 1);
                return { year: d.getFullYear(), month: d.getMonth() };
              })}
              className="rounded-lg px-3 py-1.5 text-sm transition-colors"
              style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}
            >
              ›
            </button>
          </div>

          {/* Day of week headers */}
          <div className="mb-1 grid grid-cols-7 gap-px">
            {DAY_SHORT.map(d => (
              <div key={d} className="py-1 text-center text-xs font-medium" style={{ color: 'var(--text3)' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid — no popovers inside cells to avoid clipping */}
          {(() => {
            const firstDay = new Date(calendarDate.year, calendarDate.month, 1).getDay();
            const daysInMonth = new Date(calendarDate.year, calendarDate.month + 1, 0).getDate();
            const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) => {
              if (i < firstDay) return null;
              return i - firstDay + 1;
            });
            while (cells.length % 7 !== 0) cells.push(null);

            return (
              <div
                className="grid grid-cols-7 gap-px overflow-hidden rounded-xl"
                style={{ background: 'var(--border)', border: '1px solid var(--border)' }}
              >
                {cells.map((day, idx) => {
                  if (!day) {
                    return (
                      <div key={idx} className="min-h-[52px] p-1" style={{ background: 'var(--bg2)', opacity: 0.3 }} />
                    );
                  }

                  const cellDate = new Date(calendarDate.year, calendarDate.month, day);
                  const cellDow = cellDate.getDay();
                  const isToday =
                    day === now.getDate() &&
                    calendarDate.month === now.getMonth() &&
                    calendarDate.year === now.getFullYear();

                  const daySchedules = schedules.filter(
                    s => s.days_of_week.length === 0 || s.days_of_week.includes(cellDow)
                  );
                  const allDone = daySchedules.length > 0 && isToday &&
                    daySchedules.every(s => completionMap.get(s.game_id));

                  const isSelected = selectedCalDay?.day === day && selectedCalDay?.dow === cellDow;

                  return (
                    <div
                      key={idx}
                      className="min-h-[52px] cursor-pointer p-1.5 transition-colors"
                      style={{
                        background: isSelected
                          ? 'rgba(200,155,60,0.14)'
                          : isToday ? 'rgba(200,155,60,0.07)' : 'var(--bg2)',
                        outline: isSelected ? '1px solid rgba(200,155,60,0.4)' : 'none',
                        outlineOffset: -1,
                      }}
                      onClick={() => setSelectedCalDay(
                        isSelected ? null : (daySchedules.length > 0 ? { day, dow: cellDow } : null)
                      )}
                    >
                      <div
                        className="mb-1 text-right text-xs font-semibold"
                        style={{ color: isToday ? 'var(--gold)' : 'var(--text3)' }}
                      >
                        {day}
                      </div>
                      {daySchedules.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-0.5">
                          <span
                            className="rounded-full px-1.5 py-0.5 text-xs font-semibold"
                            style={{
                              background: allDone ? 'rgba(100,200,100,0.15)' : 'rgba(200,155,60,0.2)',
                              color: allDone ? '#86efac' : 'var(--gold)',
                            }}
                          >
                            {daySchedules.length}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Selected day detail panel — rendered below grid, never clips */}
          {selectedCalDay && (() => {
            const selSchedules = schedules.filter(
              s => s.days_of_week.length === 0 || s.days_of_week.includes(selectedCalDay.dow)
            );
            return (
              <div
                className="mt-3 rounded-xl p-4"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border2)' }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text2)' }}>
                    {DAY_NAMES[selectedCalDay.dow]}, {MONTH_NAMES[calendarDate.month]} {selectedCalDay.day}
                  </p>
                  <button
                    onClick={() => setSelectedCalDay(null)}
                    className="rounded px-1.5 py-0.5 text-xs transition-colors"
                    style={{ color: 'var(--text3)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--text2)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}
                  >
                    ✕
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {selSchedules.map(s => (
                    <button
                      key={s.game_id}
                      onClick={() => {
                        setSelectedCalDay(null);
                        openModal({ game_id: s.game_id, game_name: s.game_name, server: s.server });
                      }}
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors"
                      style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border2)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >
                      <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                          {s.game_name}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text3)' }}>
                          {formatTime(s.window_start)}–{formatTime(s.window_end)} · {displayServer(s.server)}
                        </div>
                      </div>
                      <svg className="h-4 w-4 shrink-0" style={{ color: 'var(--text3)' }} viewBox="0 0 16 16" fill="none">
                        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {schedules.length === 0 && (
            <p className="mt-4 text-center text-sm" style={{ color: 'var(--text3)' }}>
              No schedules set yet.
            </p>
          )}
        </div>
      )}

      {/* All schedules summary — hidden in month view since the day detail panel covers it */}
      {schedules.length > 0 && view !== 'month' && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text3)' }}>
            All Schedules
          </h2>
          <div className="flex flex-col gap-2">
            {schedules.map(s => (
              <button
                key={s.game_id}
                onClick={() => openModal({ game_id: s.game_id, game_name: s.game_name, server: s.server })}
                className="flex items-center justify-between rounded-xl px-4 py-3 text-left transition-colors kintsugi-card"
                style={{ background: 'var(--bg2)' }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                      {s.game_name}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text3)' }}>
                      {displayServer(s.server)}
                    </span>
                    {s.hook_notifications && (
                      <span className="text-xs" style={{ color: 'var(--gold-dim)' }} title="Window-start notification enabled">
                        🔔
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs" style={{ color: 'var(--text2)' }}>
                    {formatTime(s.window_start)}–{formatTime(s.window_end)} · {daysLabel(s.days_of_week)}
                  </div>
                </div>
                <svg className="h-4 w-4 shrink-0" style={{ color: 'var(--text3)' }} viewBox="0 0 16 16" fill="none">
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Schedule modal */}
      {selectedGame && token && (
        <ScheduleModal
          game={selectedGame}
          existingSchedule={existingScheduleData}
          token={token}
          onSave={() => { setSelectedGame(null); refreshSchedules(); }}
          onDelete={() => { setSelectedGame(null); refreshSchedules(); }}
          onClose={() => setSelectedGame(null)}
        />
      )}
    </div>
  );
}
