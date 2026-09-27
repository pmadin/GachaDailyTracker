'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import type { Schedule } from '../../_lib/api';
import { timeToMinutes, formatTime } from '../../_lib/scheduleTime';

interface Props {
  /** null while loading (renders nothing). */
  schedules: Schedule[] | null;
  /** Whether the user has any play window at all, on any day. */
  hasAnySchedule: boolean;
}

type WindowState = 'now' | 'next' | 'later' | 'past';

const PILL: Record<WindowState, { label: string; style: CSSProperties }> = {
  now:   { label: 'Now',     style: { background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808', border: '1px solid transparent' } },
  next:  { label: 'Up next', style: { background: 'rgba(200,155,60,0.10)', color: 'var(--gold-bright)', border: '1px solid var(--border2)' } },
  later: { label: 'Later',   style: { background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)' } },
  past:  { label: 'Ended',   style: { background: 'transparent', color: 'var(--text3)', border: '1px solid var(--border)' } },
};

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export default function TodayPlan({ schedules, hasAnySchedule }: Props) {
  const [minute, setMinute] = useState(nowMinutes);
  useEffect(() => {
    const id = setInterval(() => setMinute(nowMinutes()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (schedules === null) return null;

  const sorted = [...schedules].sort((a, b) => timeToMinutes(a.window_start) - timeToMinutes(b.window_start));
  // First window that hasn't started yet gets "Up next".
  const nextIdx = sorted.findIndex(s => minute < timeToMinutes(s.window_start));
  const rows = sorted.map((s, i) => {
    const start = timeToMinutes(s.window_start);
    const end = timeToMinutes(s.window_end);
    let state: WindowState;
    if (minute >= start && minute < end) state = 'now';
    else if (minute >= end) state = 'past';
    else state = i === nextIdx ? 'next' : 'later';
    return { s, state };
  });

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 11,
            letterSpacing: '0.08em',
            color: 'var(--gold-bright)',
            textTransform: 'uppercase',
          }}
        >
          Today&apos;s plan
        </span>
        {hasAnySchedule && (
          <Link
            href="/schedule"
            style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, color: 'var(--gold-bright)', textDecoration: 'none' }}
          >
            Full schedule →
          </Link>
        )}
      </div>

      {rows.length === 0 && hasAnySchedule ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>Nothing planned for today.</p>
      ) : rows.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            padding: '16px 18px',
            borderRadius: 12,
            border: '1px dashed var(--border2)',
            background: 'var(--bg2)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>
              Plan when you play
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>
              Set play windows for your games and get pinged when they open.
            </p>
          </div>
          <Link
            href="/schedule"
            style={{
              flexShrink: 0,
              padding: '8px 16px',
              borderRadius: 8,
              background: 'linear-gradient(135deg, #c8913c, #e8c86a)',
              color: '#0a0808',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Open scheduler →
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {rows.map(({ s, state }) => (
            <div
              key={s.id}
              className="popular-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                opacity: state === 'past' ? 0.5 : 1,
              }}
            >
              <div style={{ width: 36, height: 36, flexShrink: 0 }}>
                <img
                  src={s.icon_name ? `${process.env.NEXT_PUBLIC_ICONS_BASE_URL}/${s.icon_name}.gif` : '/placeholder.svg'}
                  alt=""
                  width={36}
                  height={36}
                  style={{ borderRadius: 8, objectFit: 'cover', aspectRatio: '1 / 1' }}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/placeholder.svg'; }}
                />
              </div>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    fontSize: 14,
                    color: 'var(--text)',
                  }}
                >
                  {s.game_name}
                </span>
                <span style={{ display: 'block', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, color: 'var(--text2)' }}>
                  {formatTime(s.window_start)}–{formatTime(s.window_end)}
                </span>
              </span>
              <span
                style={{
                  ...PILL[state].style,
                  flexShrink: 0,
                  minWidth: 62,
                  textAlign: 'center',
                  borderRadius: 999,
                  padding: '2px 10px',
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {PILL[state].label}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
