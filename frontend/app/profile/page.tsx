'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../_context/AuthContext';
import {
  deleteAccount,
  fetchVapidKey,
  subscribePush,
  unsubscribePush,
  fetchNotificationPrefs,
  updateNotificationPrefs,
  applyDefaultReminder,
  updatePassword,
  updateEmail,
  updateTimezone,
  fetchEmailPreferences,
  updateEmailPreferences,
  fetchProfile,
  type ProfileStreakInfo,
} from '../_lib/api';
import { STREAK_TIERS, highestEarnedTier } from '../_lib/badges';
import PolyhedronBadge from '../_components/PolyhedronBadge';

const TIMEZONE_OPTIONS = [
  // Popular
  { group: 'Popular', timezone: 'America/Los_Angeles', label: 'Pacific Time (US) — UTC-8' },
  { group: 'Popular', timezone: 'America/New_York',    label: 'Eastern Time (US) — UTC-5' },
  { group: 'Popular', timezone: 'America/Chicago',     label: 'Central Time (US) — UTC-6' },
  { group: 'Popular', timezone: 'America/Santiago',    label: 'Chile Time — UTC-4' },
  { group: 'Popular', timezone: 'America/Sao_Paulo',   label: 'Brazil Time — UTC-3' },
  { group: 'Popular', timezone: 'Europe/London',       label: 'British Time — UTC+0' },
  { group: 'Popular', timezone: 'Europe/Paris',        label: 'Central European Time — UTC+1' },
  { group: 'Popular', timezone: 'Asia/Tokyo',          label: 'Japan Time — UTC+9' },
  { group: 'Popular', timezone: 'Asia/Seoul',          label: 'Korea Time — UTC+9' },
  { group: 'Popular', timezone: 'Asia/Shanghai',       label: 'China Time — UTC+8' },
  { group: 'Popular', timezone: 'Asia/Singapore',      label: 'Singapore Time — UTC+8' },
  { group: 'Popular', timezone: 'Australia/Sydney',    label: 'Sydney Time — UTC+11' },
  // Americas
  { group: 'Americas', timezone: 'America/Vancouver',              label: 'Canada Pacific Time — UTC-8' },
  { group: 'Americas', timezone: 'America/Denver',                 label: 'Mountain Time (US) — UTC-7' },
  { group: 'Americas', timezone: 'America/Toronto',                label: 'Canada Eastern Time — UTC-5' },
  { group: 'Americas', timezone: 'America/Mexico_City',            label: 'Mexico Time — UTC-6' },
  { group: 'Americas', timezone: 'America/Bogota',                 label: 'Colombia Time — UTC-5' },
  { group: 'Americas', timezone: 'America/Lima',                   label: 'Peru Time — UTC-5' },
  { group: 'Americas', timezone: 'America/Argentina/Buenos_Aires', label: 'Argentina Time — UTC-3' },
  // Europe
  { group: 'Europe', timezone: 'Europe/Berlin', label: 'Germany Time — UTC+1' },
  { group: 'Europe', timezone: 'Europe/Moscow', label: 'Moscow Time — UTC+3' },
  // Asia
  { group: 'Asia', timezone: 'Asia/Hong_Kong', label: 'Hong Kong Time — UTC+8' },
  { group: 'Asia', timezone: 'Asia/Manila',    label: 'Philippines Time — UTC+8' },
  { group: 'Asia', timezone: 'Asia/Bangkok',   label: 'Thailand Time — UTC+7' },
  { group: 'Asia', timezone: 'Asia/Jakarta',   label: 'Indonesia Time — UTC+7' },
  { group: 'Asia', timezone: 'Asia/Kolkata',   label: 'India Time — UTC+5:30' },
  { group: 'Asia', timezone: 'Asia/Dubai',     label: 'UAE Time — UTC+4' },
  // Oceania
  { group: 'Oceania', timezone: 'Australia/Melbourne', label: 'Melbourne Time — UTC+11' },
  { group: 'Oceania', timezone: 'Australia/Perth',     label: 'Perth Time — UTC+8' },
  { group: 'Oceania', timezone: 'Pacific/Auckland',    label: 'New Zealand Time — UTC+13' },
];

const TIMEZONE_GROUPS = ['Popular', 'Americas', 'Europe', 'Asia', 'Oceania'];

const ROLE_LABELS: Record<number, string> = {
  1: 'User',
  2: 'Premium',
  3: 'Admin',
  4: 'Owner',
};

const OFFSET_OPTIONS = [
  { value: 15,  label: '15 minutes before' },
  { value: 60,  label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 180, label: '3 hours before' },
  { value: 240, label: '4 hours before' },
  { value: 300, label: '5 hours before' },
  { value: 360, label: '6 hours before' },
  { value: 420, label: '7 hours before' },
  { value: 480, label: '8 hours before' },
  { value: 540, label: '9 hours before' },
  { value: 600, label: '10 hours before' },
  { value: 660, label: '11 hours before' },
  { value: 720, label: '12 hours before' },
];

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}

export default function ProfilePage() {
  const router = useRouter();
  const { token, user, login, logout, isLoading } = useAuth();

  // Delete account state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Notification state
  const [notifSupported, setNotifSupported] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifOffset, setNotifOffset] = useState(30);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState('');
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyResult, setApplyResult] = useState('');
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  // Change password state
  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  // Email digest state
  const [emailDigestEnabled, setEmailDigestEnabled] = useState(false);
  const [emailDigestHour, setEmailDigestHour] = useState(8);
  const [emailSaving, setEmailSaving] = useState(false);

  // Timezone state
  const [timezone, setTimezone]   = useState<string>('');
  const [tzSuccess, setTzSuccess] = useState('');
  const [tzError, setTzError]     = useState('');
  const [tzLoading, setTzLoading] = useState(false);

  // Change email state
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');

  useEffect(() => {
    if (!isLoading && !user) router.push('/login');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (user) {
      setIdentifier(user.username);
      if (user.timezone) setTimezone(user.timezone);
    }
  }, [user]);

  useEffect(() => {
    setNotifSupported(
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches);
  }, []);

  useEffect(() => {
    if (!token) return;
    fetchEmailPreferences(token)
      .then(prefs => {
        setEmailDigestEnabled(prefs.email_digest_enabled);
        setEmailDigestHour(prefs.email_digest_hour);
      })
      .catch(() => {});
  }, [token]);

  // Fetched fresh on every visit, not cached on the AuthUser snapshot — streak_best changes
  // daily and AuthUser only refreshes on next login.
  const [streakInfo, setStreakInfo] = useState<ProfileStreakInfo | null>(null);
  useEffect(() => {
    if (!token) return;
    fetchProfile(token)
      .then(({ user: u }) => setStreakInfo({ streak_count: u.streak_count, streak_best: u.streak_best }))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token || !notifSupported) return;
    fetchNotificationPrefs(token)
      .then(async p => {
        setNotifOffset(p.default_offset);
        if (!p.enabled) {
          setNotifEnabled(false);
          return;
        }
        // Backend may still say enabled after the user disabled — verify
        // the browser actually holds an active subscription.
        try {
          const reg = await navigator.serviceWorker.getRegistration('/');
          const sub = reg ? await reg.pushManager.getSubscription() : null;
          setNotifEnabled(!!sub);
        } catch {
          setNotifEnabled(false);
        }
      })
      .catch(() => {});
  }, [token, notifSupported]);

  const handleEnableNotifications = useCallback(async () => {
    setNotifLoading(true);
    setNotifError('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setNotifError('Notification permission was denied. Enable it in your browser settings.');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const { publicKey } = await fetchVapidKey();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await subscribePush(token!, sub.toJSON() as PushSubscriptionJSON);
      setNotifEnabled(true);
    } catch (err: unknown) {
      setNotifError(err instanceof Error ? err.message : 'Failed to enable notifications');
    } finally {
      setNotifLoading(false);
    }
  }, [token]);

  const handleDisableNotifications = useCallback(async () => {
    setNotifLoading(true);
    setNotifError('');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await unsubscribePush(token!, sub.endpoint);
          await sub.unsubscribe();
        }
      }
      setNotifEnabled(false);
    } catch (err: unknown) {
      setNotifError(err instanceof Error ? err.message : 'Failed to disable notifications');
    } finally {
      setNotifLoading(false);
    }
  }, [token]);

  const handleOffsetChange = useCallback(async (offset: number) => {
    setNotifOffset(offset);
    setApplyResult('');
    if (token) {
      updateNotificationPrefs(token, offset).catch(() => {});
    }
  }, [token]);

  const handleApplyDefault = useCallback(async () => {
    if (!token) return;
    setApplyLoading(true);
    setApplyResult('');
    try {
      const res = await applyDefaultReminder(token);
      setApplyResult(`Applied to ${res.updated} game${res.updated === 1 ? '' : 's'}`);
    } catch {
      setApplyResult('Failed to apply');
    } finally {
      setApplyLoading(false);
    }
  }, [token]);

  const handleEmailToggle = useCallback(async (enabled: boolean) => {
    setEmailSaving(true);
    setEmailDigestEnabled(enabled);
    try {
      await updateEmailPreferences(token!, { email_digest_enabled: enabled });
    } catch {
      setEmailDigestEnabled(!enabled);
    } finally {
      setEmailSaving(false);
    }
  }, [token]);

  const handleEmailHourSave = useCallback(async () => {
    if (!token) return;
    updateEmailPreferences(token, { email_digest_hour: emailDigestHour }).catch(() => {});
  }, [token, emailDigestHour]);

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (newPw !== confirmPw) {
      setPwError('New passwords do not match.');
      return;
    }
    setPwLoading(true);
    try {
      await updatePassword(token!, user!.username, currentPw, newPw, confirmPw);
      setPwSuccess('Password updated successfully.');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setShowPwForm(false);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 401) {
        setPwError('Current password is incorrect.');
      } else {
        setPwError(err instanceof Error ? err.message : 'Failed to update password');
      }
    } finally {
      setPwLoading(false);
    }
  };

  const handleEmailChange = async (e: FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setEmailSuccess('');
    setEmailLoading(true);
    try {
      const res = await updateEmail(token!, newEmail, emailPw);
      login(token!, { ...user!, email: res.user.email });
      setEmailSuccess('Email updated successfully.');
      setNewEmail('');
      setEmailPw('');
      setShowEmailForm(false);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 401) {
        setEmailError('Password is incorrect.');
      } else if (status === 409) {
        setEmailError('Email is already in use.');
      } else {
        setEmailError(err instanceof Error ? err.message : 'Failed to update email');
      }
    } finally {
      setEmailLoading(false);
    }
  };

  const handleTimezoneChange = async () => {
    setTzError('');
    setTzSuccess('');
    if (!timezone) return;
    setTzLoading(true);
    try {
      const res = await updateTimezone(token!, timezone);
      login(token!, { ...user!, timezone: res.user.timezone });
      setTzSuccess('Timezone updated successfully.');
    } catch (err: unknown) {
      setTzError(err instanceof Error ? err.message : 'Failed to update timezone');
    } finally {
      setTzLoading(false);
    }
  };

  if (isLoading || !user) return null;

  const handleDelete = async (e: FormEvent) => {
    e.preventDefault();
    setDeleteError('');

    const identifierMatch =
      identifier.trim().toLowerCase() === user!.username.toLowerCase() ||
      identifier.trim().toLowerCase() === user!.email.toLowerCase();

    if (!identifierMatch) {
      setDeleteError('Username or email does not match your account.');
      return;
    }

    if (!password.trim()) {
      setDeleteError('Please enter your password.');
      return;
    }

    if (!confirming) { setConfirming(true); return; }

    setDeleteLoading(true);
    try {
      await deleteAccount(token!, identifier.trim(), password);
      logout();
      router.push('/');
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 403) {
        setDeleteError('Incorrect password.');
      } else {
        setDeleteError(err instanceof Error ? err.message : 'Failed to delete account');
      }
      setConfirming(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  const roleLabel = ROLE_LABELS[user.role] ?? 'User';

  const timezoneDropdownOptions = user?.timezone &&
    !TIMEZONE_OPTIONS.find(t => t.timezone === user.timezone)
    ? [
        { group: 'Current', timezone: user.timezone, label: `${user.timezone} — your current timezone` },
        ...TIMEZONE_OPTIONS,
      ]
    : TIMEZONE_OPTIONS;

  const dropdownGroups = ['Current', ...TIMEZONE_GROUPS].filter(group =>
    timezoneDropdownOptions.some(t => t.group === group)
  );

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold text-white">Profile</h1>

      {/* Account info */}
      <div className="kintsugi-card mb-6 rounded-xl p-6 space-y-4" style={{ border: '1px solid rgba(200,155,60,0.12)', background: 'var(--bg2)' }}>
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-500">Username</span>
          <span className="text-sm font-medium text-white">{user.username}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-500">Email</span>
          <span className="text-sm text-zinc-300">{user.email}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-500">Role</span>
          <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: 'rgba(200,155,60,0.12)', color: 'var(--gold-bright)' }}>
            {roleLabel}
          </span>
        </div>
      </div>

      {/* Streak Badges */}
      <div className="kintsugi-card mb-6 rounded-xl p-6" style={{ border: '1px solid rgba(200,155,60,0.12)', background: 'var(--bg2)' }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Streak Badges</h2>
          {streakInfo && (
            <span className="text-xs" style={{ color: 'var(--text2)' }}>
              Best streak: <span className="font-medium text-white">{streakInfo.streak_best}</span> day
              {streakInfo.streak_best === 1 ? '' : 's'}
              {(() => {
                const current = highestEarnedTier(streakInfo.streak_best);
                return current ? (
                  <>
                    {' · '}
                    <span style={{ color: 'var(--gold-bright)' }}>{current.label}</span>
                  </>
                ) : null;
              })()}
            </span>
          )}
        </div>
        <p className="mb-4 text-xs" style={{ color: 'var(--text3)' }}>
          Earned at your best-ever streak — kept forever, even if the streak later breaks.
        </p>
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
          {STREAK_TIERS.map(tier => {
            const earned = streakInfo != null && streakInfo.streak_best >= tier.days;
            return (
              <div key={tier.key} className="flex flex-col items-center gap-1.5">
                <PolyhedronBadge tier={tier} locked={!earned} size={44} />
                <span className="text-xs" style={{ color: earned ? 'var(--text)' : 'var(--text3)' }}>
                  {tier.label}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--text3)' }}>
                  {tier.days}d
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Change Password */}
      <div className="kintsugi-card mb-6 rounded-xl p-6" style={{ border: '1px solid rgba(200,155,60,0.12)', background: 'var(--bg2)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Password</h2>
            {pwSuccess && !showPwForm && (
              <p className="mt-0.5 text-xs text-emerald-500">{pwSuccess}</p>
            )}
          </div>
          <button
            onClick={() => { setShowPwForm(v => !v); setPwError(''); setPwSuccess(''); }}
            className="text-sm transition-colors"
            style={{ color: 'var(--gold-bright)' }}
          >
            {showPwForm ? 'Cancel' : 'Change'}
          </button>
        </div>

        {showPwForm && (
          <form onSubmit={handlePasswordChange} className="mt-4 space-y-3">
            <div>
              <label className="mb-1.5 block text-xs text-zinc-500">Current password</label>
              <input
                type="password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                required
                className="w-full rounded-lg px-4 py-2 text-sm text-white outline-none"
                style={{ border: '1px solid rgba(200,155,60,0.15)', background: 'var(--bg2)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.15)')}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-zinc-500">New password</label>
              <input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                required
                minLength={15}
                className="w-full rounded-lg px-4 py-2 text-sm text-white outline-none"
                style={{ border: '1px solid rgba(200,155,60,0.15)', background: 'var(--bg2)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.15)')}
              />
              <p className="mt-1 text-xs text-zinc-600">Min 15 characters, must include uppercase, lowercase, number, and symbol</p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-zinc-500">Confirm new password</label>
              <input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                required
                className="w-full rounded-lg px-4 py-2 text-sm text-white outline-none"
                style={{ border: '1px solid rgba(200,155,60,0.15)', background: 'var(--bg2)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.15)')}
              />
            </div>
            {pwError && (
              <p className="rounded-lg bg-red-950 px-4 py-2.5 text-sm text-red-400">{pwError}</p>
            )}
            <button
              type="submit"
              disabled={pwLoading}
              className="w-full rounded-lg py-2 text-sm font-medium transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
            >
              {pwLoading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>

      {/* Change Email */}
      <div className="kintsugi-card mb-6 rounded-xl p-6" style={{ border: '1px solid rgba(200,155,60,0.12)', background: 'var(--bg2)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Email</h2>
            {emailSuccess && !showEmailForm && (
              <p className="mt-0.5 text-xs text-emerald-500">{emailSuccess}</p>
            )}
          </div>
          <button
            onClick={() => { setShowEmailForm(v => !v); setEmailError(''); setEmailSuccess(''); }}
            className="text-sm transition-colors"
            style={{ color: 'var(--gold-bright)' }}
          >
            {showEmailForm ? 'Cancel' : 'Change'}
          </button>
        </div>

        {showEmailForm && (
          <form onSubmit={handleEmailChange} className="mt-4 space-y-3">
            <div>
              <label className="mb-1.5 block text-xs text-zinc-500">New email</label>
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                required
                className="w-full rounded-lg px-4 py-2 text-sm text-white outline-none"
                style={{ border: '1px solid rgba(200,155,60,0.15)', background: 'var(--bg2)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.15)')}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-zinc-500">Current password</label>
              <input
                type="password"
                value={emailPw}
                onChange={e => setEmailPw(e.target.value)}
                required
                className="w-full rounded-lg px-4 py-2 text-sm text-white outline-none"
                style={{ border: '1px solid rgba(200,155,60,0.15)', background: 'var(--bg2)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.15)')}
              />
            </div>
            {emailError && (
              <p className="rounded-lg bg-red-950 px-4 py-2.5 text-sm text-red-400">{emailError}</p>
            )}
            <button
              type="submit"
              disabled={emailLoading}
              className="w-full rounded-lg py-2 text-sm font-medium transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
            >
              {emailLoading ? 'Updating…' : 'Update email'}
            </button>
          </form>
        )}
      </div>

      {/* Push Notifications */}
      <div className="kintsugi-card mb-6 rounded-xl p-6" style={{ border: '1px solid rgba(200,155,60,0.12)', background: 'var(--bg2)' }}>
        <h2 className="mb-1 text-base font-semibold text-white">Push Notifications</h2>
        <p className="mb-5 text-sm text-zinc-500">
          Get reminded before your daily resets, even when the app is closed.
        </p>

        {!notifSupported ? (
          <p className="text-sm text-zinc-500">
            Push notifications are not supported in this browser.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white">
                {notifEnabled ? 'Reminders enabled' : 'Reminders disabled'}
              </span>
              <button
                onClick={notifEnabled ? handleDisableNotifications : handleEnableNotifications}
                disabled={notifLoading}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  notifEnabled
                    ? 'border-[rgba(200,155,60,0.15)] text-[#9a8570] hover:border-[rgba(200,155,60,0.3)] hover:text-[#f0ede8] border'
                    : 'hover:opacity-90'
                }`}
                style={!notifEnabled ? { background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' } : undefined}
              >
                {notifLoading ? '…' : notifEnabled ? 'Disable' : 'Enable'}
              </button>
            </div>

            {notifEnabled && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Default reminder time</span>
                <select
                  value={notifOffset}
                  onChange={e => handleOffsetChange(parseInt(e.target.value, 10))}
                  className="rounded-lg px-3 py-1.5 text-sm text-white outline-none"
                  style={{ border: '1px solid rgba(200,155,60,0.15)', background: 'var(--surface)' }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.15)')}
                >
                  {OFFSET_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            )}

            {notifEnabled && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Apply default to all games</span>
                  <button
                    onClick={handleApplyDefault}
                    disabled={applyLoading}
                    className="rounded-lg border px-3 py-1.5 text-sm transition-colors hover:border-[rgba(200,155,60,0.3)] hover:text-[#f0ede8] disabled:opacity-50 border-[rgba(200,155,60,0.15)] text-[#9a8570]"
                  >
                    {applyLoading ? '…' : `Set all to ${notifOffset < 60 ? `${notifOffset} min` : `${notifOffset / 60} hr`}`}
                  </button>
                </div>
                {applyResult && (
                  <p className="text-xs text-zinc-500">{applyResult}</p>
                )}
                <p className="text-xs text-zinc-600">
                  Per-game reminders can also be set individually from My List.
                </p>
              </div>
            )}

            {notifError && (
              <p className="rounded-lg bg-red-950 px-4 py-2.5 text-sm text-red-400">{notifError}</p>
            )}

            {isIOS && !isStandalone && (
              <p className="rounded-lg px-4 py-2.5 text-xs" style={{ border: '1px solid rgba(200,155,60,0.10)', background: 'rgba(13,11,8,0.5)', color: 'var(--text3)' }}>
                On iPhone, add GachaDaily to your Home Screen first — iOS requires it for push notifications to work.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Email Digest */}
      <div className="kintsugi-card mb-6 rounded-xl p-6" style={{ border: '1px solid rgba(200,155,60,0.12)', background: 'var(--bg2)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-white">Daily Email Digest</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              Get a daily summary of your upcoming game resets.
            </p>
          </div>
          {/* Toggle switch */}
          <button
            onClick={() => handleEmailToggle(!emailDigestEnabled)}
            disabled={emailSaving}
            aria-checked={emailDigestEnabled}
            role="switch"
            className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 disabled:opacity-50"
            style={{ background: emailDigestEnabled ? 'linear-gradient(135deg, #c8913c, #e8c86a)' : '#3f3f46' }}
          >
            <span
              className="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
              style={{ transform: emailDigestEnabled ? 'translateX(1.375rem)' : 'translateX(0.25rem)' }}
            />
          </button>
        </div>

        {emailDigestEnabled && (
          <div className="border-t pt-4" style={{ borderColor: 'rgba(200,155,60,0.12)' }}>
            <label className="block text-sm text-zinc-400 mb-2">
              Send digest at (your local time)
            </label>
            <select
              value={emailDigestHour}
              onChange={e => setEmailDigestHour(Number(e.target.value))}
              onBlur={handleEmailHourSave}
              className="rounded-lg px-3 py-2 text-sm text-white outline-none"
              style={{ border: '1px solid rgba(200,155,60,0.15)', background: 'var(--surface)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)')}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? '12:00 AM' : i < 12
                    ? `${i}:00 AM`
                    : i === 12
                      ? '12:00 PM'
                      : `${i - 12}:00 PM`}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-zinc-600">
              Based on your account timezone: {user.timezone ?? 'America/Los_Angeles'}
            </p>
          </div>
        )}
      </div>

      {/* Timezone */}
      <div className="kintsugi-card mb-6 rounded-xl p-6" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <h2 className="mb-1 text-base font-semibold" style={{ color: 'var(--text)' }}>Timezone</h2>
        <p className="mb-5 text-sm" style={{ color: 'var(--text2)' }}>
          Controls when your daily reset timers count down. Set this to wherever you actually play.
        </p>

        <div className="flex gap-2">
          <select
            value={timezone}
            onChange={e => {
              setTimezone(e.target.value);
              setTzSuccess('');
              setTzError('');
            }}
            className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            {dropdownGroups.map(group => (
              <optgroup key={group} label={group}>
                {timezoneDropdownOptions.filter(tz => tz.group === group).map(tz => (
                  <option key={tz.timezone} value={tz.timezone}>{tz.label}</option>
                ))}
              </optgroup>
            ))}
          </select>

          <button
            onClick={() => {
              const detected = typeof window !== 'undefined'
                ? Intl.DateTimeFormat().resolvedOptions().timeZone
                : '';
              if (detected) {
                setTimezone(detected);
                setTzSuccess('');
                setTzError('');
              }
            }}
            className="rounded-lg px-3 py-2 text-xs font-medium transition-opacity hover:opacity-80"
            style={{ background: 'var(--surface)', border: '1px solid var(--border2)', color: 'var(--gold)', whiteSpace: 'nowrap' }}
          >
            Detect
          </button>
        </div>

        {tzSuccess && (
          <p className="mt-3 rounded-lg px-4 py-2.5 text-sm text-green-400" style={{ background: 'rgba(34,197,94,0.08)' }}>
            {tzSuccess}
          </p>
        )}
        {tzError && (
          <p className="mt-3 rounded-lg px-4 py-2.5 text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)' }}>
            {tzError}
          </p>
        )}

        <button
          onClick={handleTimezoneChange}
          disabled={tzLoading || timezone === user?.timezone}
          className="mt-4 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
        >
          {tzLoading ? 'Saving…' : 'Save timezone'}
        </button>
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6">
        <h2 className="mb-1 text-base font-semibold text-red-400">Delete account</h2>
        <p className="mb-5 text-sm text-zinc-500">
          This permanently deletes your account and all associated data including your game list and completion history. This cannot be undone.
        </p>

        <form onSubmit={handleDelete} className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs text-zinc-500">Username or email</label>
            <input
              type="text"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              required
              className="w-full rounded-lg px-4 py-2 text-sm text-white outline-none focus:border-red-500"
              style={{ border: '1px solid rgba(200,155,60,0.15)', background: 'var(--bg2)' }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-zinc-500">Current password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="Confirm with your password"
              className="w-full rounded-lg px-4 py-2 text-sm text-white outline-none focus:border-red-500"
              style={{ border: '1px solid rgba(200,155,60,0.15)', background: 'var(--bg2)' }}
            />
          </div>

          {deleteError && (
            <p className="rounded-lg bg-red-950 px-4 py-2.5 text-sm text-red-400">{deleteError}</p>
          )}

          {confirming && (
            <p className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
              Are you sure? This action is permanent and cannot be reversed. Click again to confirm.
            </p>
          )}

          <div className="flex gap-2 pt-1">
            {confirming && (
              <button
                type="button"
                onClick={() => { setConfirming(false); setPassword(''); setDeleteError(''); }}
                className="flex-1 rounded-lg border border-[rgba(200,155,60,0.15)] py-2 text-sm text-[#9a8570] transition-colors hover:border-[rgba(200,155,60,0.3)] hover:text-[#f0ede8]"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={deleteLoading}
              className="flex-1 rounded-lg bg-red-700 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleteLoading ? 'Deleting…' : confirming ? 'Yes, delete my account' : 'Delete my account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
