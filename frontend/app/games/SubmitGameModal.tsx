'use client';

import { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import { fetchTimezones, submitGame, type TimezoneEntry } from '../_lib/api';
import { useAuth } from '../_context/AuthContext';

interface Props {
  token: string;
  onClose: () => void;
}

export default function SubmitGameModal({ token, onClose }: Props) {
  const { user } = useAuth();
  const emailUnverified = user?.email_verified === false;
  const [timezones, setTimezones] = useState<Record<string, TimezoneEntry[]>>({});
  const [form, setForm] = useState({
    name: '',
    server: '',
    timezone: 'America/Los_Angeles',
    daily_reset: '04:00',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchTimezones()
      .then(tz => setTimezones(tz))
      .catch(() => {});
  }, []);

  const field = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await submitGame(token, {
        name: form.name.trim(),
        server: form.server.trim(),
        timezone: form.timezone,
        daily_reset: form.daily_reset,
        notes: form.notes.trim() || undefined,
      });
      setSuccess(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed');
      setSaving(false);
    }
  };

  const inputStyle = {
    border: '1px solid rgba(200,155,60,0.15)',
    background: 'var(--surface)',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-md rounded-xl p-6"
        style={{ border: '1px solid rgba(200,155,60,0.15)', background: 'var(--bg2)' }}
      >
        <h2 className="mb-5 text-base font-semibold text-white">Submit a Game for Review</h2>

        {emailUnverified ? (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text2)' }}>
              Game suggestions need a verified email so we can follow up if something about the game is unclear.
            </p>
            <div className="flex gap-2">
              <Link
                href="/verify-email"
                className="flex-1 rounded-lg py-2 text-center text-sm font-medium hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
              >
                Verify email
              </Link>
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border py-2 text-sm"
                style={{ borderColor: 'rgba(200,155,60,0.20)', color: 'var(--text2)' }}
              >
                Close
              </button>
            </div>
          </div>
        ) : success ? (
          <div className="space-y-4">
            <p className="rounded-lg bg-emerald-950/60 px-4 py-3 text-sm text-emerald-400">
              {success}
            </p>
            <button
              onClick={onClose}
              className="w-full rounded-lg py-2 text-sm font-medium hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Game Name *</label>
              <input
                value={form.name}
                onChange={field('name')}
                required
                placeholder="e.g. Wuthering Waves"
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.15)')}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">Server / Region *</label>
              <input
                value={form.server}
                onChange={field('server')}
                required
                placeholder="Global, NA, JP, etc."
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.15)')}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">Timezone *</label>
              <select
                value={form.timezone}
                onChange={field('timezone')}
                required
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                style={inputStyle}
              >
                {Object.entries(timezones).map(([region, entries]) => (
                  <optgroup key={region} label={region} style={{ background: 'var(--bg2)' }}>
                    {entries.map(e => (
                      <option key={e.timezone} value={e.timezone} style={{ background: 'var(--bg2)' }}>
                        {e.label} ({e.offset})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">Daily Reset *</label>
              <input
                type="time"
                value={form.daily_reset}
                onChange={field('daily_reset')}
                required
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                style={{ ...inputStyle, colorScheme: 'dark' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.15)')}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">Notes (optional)</label>
              <textarea
                value={form.notes}
                onChange={field('notes')}
                placeholder="Any extra info for the admin…"
                rows={3}
                maxLength={500}
                className="w-full resize-none rounded-lg px-3 py-2 text-sm text-white outline-none"
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.15)')}
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-400">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-[rgba(200,155,60,0.15)] py-2 text-sm text-[#9a8570] hover:text-[#f0ede8]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-lg py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
              >
                {saving ? 'Submitting…' : 'Submit for Review'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
