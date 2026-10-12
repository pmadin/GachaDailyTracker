'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Props {
  /** ISO timestamp when the unverified account gets deleted. */
  deadline: string;
}

function splitRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/**
 * Profile-only countdown for unverified signups, styled like a limited-time gacha banner:
 * the "banner" ending is the account being deleted. Replaces the top strip on /profile.
 */
export default function DeletionBannerCard({ deadline }: Props) {
  const end = new Date(deadline).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (Number.isNaN(end)) return null;

  const remaining = end - now;
  const ended = remaining <= 0;
  const urgent = !ended && remaining < 24 * 3600_000;
  const { days, hours, minutes, seconds } = splitRemaining(remaining);
  const endLabel = new Date(end).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  const units = [
    { label: 'Days', value: days },
    { label: 'Hrs', value: hours },
    { label: 'Min', value: minutes },
    { label: 'Sec', value: seconds },
  ];

  return (
    <section
      aria-label="Account deletion countdown"
      className="deletion-banner mb-6 rounded-xl p-6"
      style={{
        border: '1px solid var(--border2)',
        background:
          'radial-gradient(ellipse 80% 70% at 100% 0%, rgba(200,145,60,0.16), transparent 60%), linear-gradient(160deg, #18140d 0%, #0d0b08 70%)',
      }}
    >
      {/* Banner header: live pill + limited label */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
          style={{ background: 'rgba(200,155,60,0.12)', border: '1px solid var(--border2)', color: 'var(--gold-bright)' }}
        >
          <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-red-400" aria-hidden="true" />
          {ended ? 'Banner ended' : 'Active banner'}
        </span>
        <span className="font-jetbrains-mono text-[11px] uppercase tracking-widest" style={{ color: 'var(--text2)' }}>
          Limited · Account deletion
        </span>
      </div>

      <h2 className="text-xl font-bold text-white">
        {ended ? 'This account is up for deletion' : 'Your account is on a limited banner'}
      </h2>
      <p className="mt-1.5 text-sm" style={{ color: 'var(--text2)' }}>
        {ended
          ? 'The verification window has closed and the account will be removed shortly. Verify now to keep it.'
          : 'Unverified accounts are removed when this banner ends. Verify your email to keep your games, streak and badges.'}
      </p>

      {/* Countdown */}
      <div className="mt-5">
        <p className="mb-2 text-[11px] uppercase tracking-wider" style={{ color: 'var(--text2)' }}>
          Ends in
        </p>
        <div className="grid grid-cols-4 gap-2" role="timer" aria-live="off">
          {units.map(u => (
            <div
              key={u.label}
              className="rounded-lg py-2.5 text-center"
              style={{ background: 'rgba(8,8,8,0.6)', border: '1px solid rgba(200,155,60,0.18)' }}
            >
              <div
                className={`font-jetbrains-mono text-2xl font-bold tabular-nums leading-none ${urgent || ended ? 'text-red-400' : ''}`}
                style={urgent || ended ? undefined : { color: 'var(--gold-bright)' }}
              >
                {String(u.value).padStart(2, '0')}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-wider" style={{ color: 'var(--text3)' }}>
                {u.label}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs" style={{ color: 'var(--text3)' }}>
          Ends {endLabel}
        </p>
      </div>

      <Link
        href="/verify-email"
        className="mt-5 block rounded-lg py-2.5 text-center text-sm font-semibold hover:opacity-90"
        style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
      >
        Verify email to keep this account
      </Link>
    </section>
  );
}
