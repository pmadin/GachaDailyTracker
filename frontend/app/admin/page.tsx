'use client';

import Link from 'next/link';
import { useAuth } from '../_context/AuthContext';
import { useEffect, useState } from 'react';
import { fetchAdminSettings } from '../_lib/api';

const ROLE_LABELS: Record<number, string> = { 3: 'Admin', 4: 'Owner' };

export default function AdminOverviewPage() {
  const { user, token } = useAuth();
  const [leaderboardOn, setLeaderboardOn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) return;
    fetchAdminSettings(token)
      .then(({ settings }) => setLeaderboardOn(settings.leaderboard_enabled === 'true'))
      .catch(() => {});
  }, [token]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Signed in as{' '}
          <span className="text-zinc-300">{user?.username}</span>
          {' · '}
          <span style={{ color: 'var(--gold-bright)' }}>{ROLE_LABELS[user?.role ?? 3]}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link
          href="/admin/analytics"
          className="kintsugi-card no-veins group rounded-xl p-6 transition-colors"
          style={{ border: '1px solid rgba(200,155,60,0.12)', background: 'var(--bg2)' }}
        >
          <div
            className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ background: 'rgba(200,155,60,0.10)', border: '1px solid rgba(200,155,60,0.20)' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M4 20V10M11 20V4M18 20v-7" stroke="#c8913c" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M4 20h16" stroke="#c8913c" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
            </svg>
          </div>
          <h2 className="mb-1 text-base font-semibold text-white group-hover:text-[#e8c86a] transition-colors">
            Analytics
          </h2>
          <p className="text-sm text-zinc-500">
            Streaks, most-tracked games, region and country breakdowns, signup and activity trends.
          </p>
        </Link>

        <Link
          href="/admin/games"
          className="kintsugi-card no-veins group rounded-xl p-6 transition-colors"
          style={{ border: '1px solid rgba(200,155,60,0.12)', background: 'var(--bg2)' }}
        >
          <div
            className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ background: 'rgba(200,155,60,0.10)', border: '1px solid rgba(200,155,60,0.20)' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="9" width="18" height="10" rx="5" stroke="#c8913c" strokeWidth="1.5"/>
              <path d="M8.5 9C8.5 7.6 9.6 7 10.5 7h3c.9 0 2 .6 2 2" stroke="#c8913c" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M9 14v-2M8 13h2" stroke="#c8913c" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="15" cy="12.5" r="0.85" fill="#c8913c"/>
              <circle cx="15" cy="15.5" r="0.85" fill="#c8913c"/>
              <circle cx="12" cy="14" r="0.65" fill="#c8913c" opacity="0.55"/>
            </svg>
          </div>
          <h2 className="mb-1 text-base font-semibold text-white group-hover:text-[#e8c86a] transition-colors">
            Game Management
          </h2>
          <p className="text-sm text-zinc-500">
            Add, edit, soft-delete, and restore games. Import from Game-Time-Master source. Manage icons.
          </p>
        </Link>

        <Link
          href="/admin/users"
          className="kintsugi-card no-veins group rounded-xl p-6 transition-colors"
          style={{ border: '1px solid rgba(200,155,60,0.12)', background: 'var(--bg2)' }}
        >
          <div
            className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ background: 'rgba(200,155,60,0.10)', border: '1px solid rgba(200,155,60,0.20)' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="15.5" cy="7" r="2.5" stroke="#c8913c" strokeWidth="1.5" opacity="0.55"/>
              <path d="M19.5 20c0-2.5-1.8-4.5-4-5" stroke="#c8913c" strokeWidth="1.5" strokeLinecap="round" opacity="0.55"/>
              <circle cx="9" cy="7.5" r="3" stroke="#c8913c" strokeWidth="1.5"/>
              <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#c8913c" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h2 className="mb-1 text-base font-semibold text-white group-hover:text-[#e8c86a] transition-colors">
            User Management
          </h2>
          <p className="text-sm text-zinc-500">
            View users, update roles, manage accounts.
          </p>
        </Link>

        <Link
          href="/admin/submissions"
          className="kintsugi-card no-veins group rounded-xl p-6 transition-colors"
          style={{ border: '1px solid rgba(200,155,60,0.12)', background: 'var(--bg2)' }}
        >
          <div
            className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ background: 'rgba(200,155,60,0.10)', border: '1px solid rgba(200,155,60,0.20)' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="5" y="4" width="14" height="17" rx="2" stroke="#c8913c" strokeWidth="1.5"/>
              <rect x="9" y="2" width="6" height="4" rx="1" stroke="#c8913c" strokeWidth="1.5"/>
              <path d="M8.5 13.5l2.5 2.5 4-4" stroke="#c8913c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="mb-1 text-base font-semibold text-white group-hover:text-[#e8c86a] transition-colors">
            Game Submissions
          </h2>
          <p className="text-sm text-zinc-500">
            Review user-submitted games. Approve to add, reject to dismiss.
          </p>
        </Link>

        <Link
          href="/admin/settings"
          className="kintsugi-card no-veins group rounded-xl p-6 transition-colors"
          style={{ border: '1px solid rgba(200,155,60,0.12)', background: 'var(--bg2)' }}
        >
          <div
            className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ background: 'rgba(200,155,60,0.10)', border: '1px solid rgba(200,155,60,0.20)' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <line x1="4" y1="6" x2="20" y2="6" stroke="#c8913c" strokeWidth="1.4" strokeLinecap="round" opacity="0.4"/>
              <line x1="4" y1="12" x2="20" y2="12" stroke="#c8913c" strokeWidth="1.4" strokeLinecap="round" opacity="0.4"/>
              <line x1="4" y1="18" x2="20" y2="18" stroke="#c8913c" strokeWidth="1.4" strokeLinecap="round" opacity="0.4"/>
              <circle cx="15" cy="6" r="2.5" stroke="#c8913c" strokeWidth="1.5" fill="#0d0b08"/>
              <circle cx="9" cy="12" r="2.5" stroke="#c8913c" strokeWidth="1.5" fill="#0d0b08"/>
              <circle cx="16" cy="18" r="2.5" stroke="#c8913c" strokeWidth="1.5" fill="#0d0b08"/>
            </svg>
          </div>
          <h2 className="mb-1 text-base font-semibold text-white group-hover:text-[#e8c86a] transition-colors">
            Site Settings
          </h2>
          <p className="text-sm text-zinc-500">
            Toggle leaderboard visibility and other site-wide features.
            {leaderboardOn !== null && (
              <span className="ml-1" style={{ color: leaderboardOn ? '#86efac' : '#4a3d2a' }}>
                · Leaderboard {leaderboardOn ? 'on' : 'off'}
              </span>
            )}
          </p>
        </Link>
      </div>
    </div>
  );
}
