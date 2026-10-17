'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import Link from 'next/link';
import { fetchGames, fetchTimezones, submitGame, type Game, type TimezoneEntry } from '../_lib/api';
import { useAuth } from '../_context/AuthContext';
import { displayServer, OTHER_SERVER_RE, SUBMIT_SERVER_OPTIONS } from '../_lib/servers';
import { browserTimezone, resetLocal, resetUtc } from '../_lib/resetTime';

interface Props {
  token: string;
  onClose: () => void;
}

const OTHER = '__other__';

export default function SubmitGameModal({ token, onClose }: Props) {
  const { user } = useAuth();
  const emailUnverified = user?.email_verified === false;
  const [timezones, setTimezones] = useState<Record<string, TimezoneEntry[]>>({});
  // Default to the submitter's own clock: that's the one they can read a time off.
  const [myTz] = useState(browserTimezone);
  const [form, setForm] = useState({
    name: '',
    server: '',
    otherServer: '',
    timezone: myTz,
    daily_reset: '04:00',
    notes: '',
  });
  const [matches, setMatches] = useState<Game[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchTimezones()
      .then(tz => setTimezones(tz))
      .catch(() => {});
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, []);

  const field = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  // "Already tracked" lookup, debounced from the input handler.
  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setForm(f => ({ ...f, name }));
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const seq = ++searchSeq.current;
    if (name.trim().length < 3) { setMatches([]); return; }
    searchTimer.current = setTimeout(() => {
      fetchGames({ search: name.trim(), limit: 3 })
        .then(r => { if (seq === searchSeq.current) setMatches(r.games); })
        .catch(() => {});
    }, 400);
  };

  const isOther = form.server === OTHER;
  const serverValue = isOther ? form.otherServer.trim() : form.server;
  const otherInvalid = isOther && form.otherServer.trim() !== '' && !OTHER_SERVER_RE.test(form.otherServer.trim());

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isOther && !OTHER_SERVER_RE.test(serverValue)) {
      setError("Server name: 2–30 letters, numbers, spaces or & / ( ) - '");
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await submitGame(token, {
        name: form.name.trim(),
        server: serverValue,
        server_other: isOther || undefined,
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
  const focus = {
    onFocus: (e: React.FocusEvent<HTMLElement>) => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)'),
    onBlur: (e: React.FocusEvent<HTMLElement>) => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.15)'),
  };
  const hint = 'mt-1 text-[11px] leading-snug';

  // The curated list may not include the browser's zone; keep it selectable.
  const tzKnown = Object.values(timezones).some(list => list.some(t => t.timezone === form.timezone));
  const utc = resetUtc(form.timezone, form.daily_reset);
  const local = resetLocal(form.timezone, form.daily_reset);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
      <div
        className="my-auto w-full max-w-md rounded-xl p-6"
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
                onChange={onNameChange}
                required
                maxLength={255}
                placeholder="e.g. Wuthering Waves"
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                style={inputStyle}
                {...focus}
              />
              {matches.length > 0 && (
                <div className="mt-1.5 rounded-lg px-3 py-2 text-[11px]" style={{ background: 'rgba(200,155,60,0.07)', border: '1px solid var(--border)' }}>
                  <p style={{ color: 'var(--gold)' }}>Already tracked. If your server is listed, add it from the games list instead:</p>
                  <ul className="mt-1 space-y-0.5" style={{ color: 'var(--text2)' }}>
                    {matches.map(g => (
                      <li key={g.id}>
                        {g.name} · {displayServer(g.server)}{' '}
                        <span style={{ color: 'var(--text3)' }}>(resets {resetUtc(g.timezone, g.daily_reset)})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">Server *</label>
              <select
                value={form.server}
                onChange={field('server')}
                required
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                style={inputStyle}
              >
                <option value="" disabled style={{ background: 'var(--bg2)' }}>Pick the server you play on…</option>
                {SUBMIT_SERVER_OPTIONS.map(o => (
                  <option key={o.value} value={o.value} style={{ background: 'var(--bg2)' }}>{o.label}</option>
                ))}
                <option value={OTHER} style={{ background: 'var(--bg2)' }}>Other…</option>
              </select>
              {isOther && (
                <input
                  value={form.otherServer}
                  onChange={field('otherServer')}
                  required
                  maxLength={30}
                  placeholder="Server name as the game shows it"
                  className="mt-2 w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                  style={{ ...inputStyle, ...(otherInvalid ? { borderColor: 'rgba(239,68,68,0.6)' } : {}) }}
                  {...focus}
                />
              )}
              <p className={hint} style={{ color: 'var(--text3)' }}>
                Pick a region, not the store or platform (Steam, Nutaku, Google Play). A Global server still has one reset time for everyone on it.
                {isOther && ' For Other, please explain the server in the notes.'}
              </p>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div className="min-w-0">
                <label className="mb-1 block text-xs text-zinc-400">Timezone of that time *</label>
                <select
                  value={form.timezone}
                  onChange={field('timezone')}
                  required
                  className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                  style={inputStyle}
                >
                  {!tzKnown && <option value={form.timezone} style={{ background: 'var(--bg2)' }}>{form.timezone}{form.timezone === myTz ? ' (yours)' : ''}</option>}
                  {Object.entries(timezones).map(([region, entries]) => (
                    <optgroup key={region} label={region} style={{ background: 'var(--bg2)' }}>
                      {entries.map(e => (
                        <option key={e.timezone} value={e.timezone} style={{ background: 'var(--bg2)' }}>
                          {e.label} ({e.offset}){e.timezone === myTz ? ' (yours)' : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Daily reset *</label>
                <input
                  type="time"
                  value={form.daily_reset}
                  onChange={field('daily_reset')}
                  required
                  className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                  {...focus}
                />
              </div>
            </div>
            <div className="-mt-1">
              <p className="font-jetbrains-mono text-xs" style={{ color: 'var(--gold-bright)' }}>
                = {utc}{local && ` · ${local} your time`}
              </p>
              <p className={hint} style={{ color: 'var(--text3)' }}>
                Usually when daily login rewards reset. Enter it on your own clock or the server&apos;s, whichever is easier, and pick the matching timezone. Check the line above against the in-game timer.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">Notes {isOther ? '*' : '(optional)'}</label>
              <textarea
                value={form.notes}
                onChange={field('notes')}
                required={isOther}
                placeholder={isOther ? 'Which server is this? Where did you find the reset time?' : 'Any extra info for the admin…'}
                rows={3}
                maxLength={500}
                className="w-full resize-none rounded-lg px-3 py-2 text-sm text-white outline-none"
                style={inputStyle}
                {...focus}
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
