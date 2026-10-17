'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GameCard from '../../_components/GameCard';
import DashboardCard from '../../_components/DashboardCard';
import { gameIconSrc } from '../../_lib/icons';
import { displayServer, SUBMIT_SERVER_OPTIONS } from '../../_lib/servers';
import { describeResetDiff, resetDiffMinutes, resetInZone, resetLocal, resetUtc, zoneCity } from '../../_lib/resetTime';
import {
  approveSubmission,
  fetchServers,
  fetchSimilarGames,
  fetchTimezones,
  previewIcon,
  type GameSubmission,
  type IconFit,
  type SimilarGame,
  type TimezoneEntry,
} from '../../_lib/api';

const inputStyle = { border: '1px solid rgba(200,155,60,0.15)', background: 'var(--surface)' };
const focusOn = (e: React.FocusEvent<HTMLElement>) => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)');
const focusOff = (e: React.FocusEvent<HTMLElement>) => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.15)');
const noop = () => {};

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs text-zinc-400">{children}</label>;
}

/** "Submitted: X" under a field once the admin has changed it. */
function Original({ value, current }: { value: string; current: string }) {
  if (value === current) return null;
  return (
    <p className="mt-1 text-xs" style={{ color: 'var(--text3)' }}>
      Submitted: <span className="font-mono" style={{ color: 'var(--text2)' }}>{value}</span>
    </p>
  );
}

/**
 * Full review for one pending submission: fix the fields, catch near-duplicates, add an icon,
 * and see the game exactly as users will (real GameCard + DashboardCard), then approve.
 */
export default function ReviewPanel({
  token,
  submission,
  onDone,
  onClose,
}: {
  token: string;
  submission: GameSubmission;
  onDone: (message: string) => void;
  onClose: () => void;
}) {
  const original = {
    name: submission.name,
    server: submission.server,
    timezone: submission.timezone,
    daily_reset: submission.daily_reset.slice(0, 5),
  };
  const [form, setForm] = useState(original);
  const [notes, setNotes] = useState('');
  const [timezones, setTimezones] = useState<Record<string, TimezoneEntry[]>>({});
  const [servers, setServers] = useState<string[]>([]);
  const [similar, setSimilar] = useState<SimilarGame[] | null>(null);

  const [iconFile, setIconFile] = useState<File | null>(null);
  const [fit, setFit] = useState<IconFit>('cover');
  const [iconPreview, setIconPreview] = useState<{ url: string; bytes: number; animated: boolean } | null>(null);
  const [iconError, setIconError] = useState('');
  const [iconBusy, setIconBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState<'active' | 'inactive' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTimezones().then(setTimezones).catch(() => {});
    fetchServers().then(r => setServers(r.servers.map(s => s.server))).catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  // Near-duplicates for the name as currently edited, debounced like the admin games search.
  useEffect(() => {
    const id = setTimeout(() => {
      fetchSimilarGames(token, submission.id, form.name.trim() || undefined)
        .then(r => setSimilar(r.games))
        .catch(() => setSimilar([]));
    }, 400);
    return () => clearTimeout(id);
  }, [token, submission.id, form.name]);

  // Run the real server pipeline on every file or fit change. Only the latest request wins.
  const previewSeq = useRef(0);
  const runPreview = useCallback((file: File, nextFit: IconFit) => {
    const seq = ++previewSeq.current;
    setIconBusy(true);
    setIconError('');
    previewIcon(token, file, nextFit)
      .then(r => { if (seq === previewSeq.current) setIconPreview({ url: r.data_url, bytes: r.bytes, animated: r.animated }); })
      .catch(err => {
        if (seq !== previewSeq.current) return;
        setIconPreview(null);
        setIconError(err instanceof Error ? err.message : 'Icon processing failed');
      })
      .finally(() => { if (seq === previewSeq.current) setIconBusy(false); });
  }, [token]);

  const exactDupe = useMemo(
    () => similar?.find(g =>
      g.name.toLowerCase() === form.name.trim().toLowerCase() &&
      g.server.toLowerCase() === form.server.trim().toLowerCase()),
    [similar, form.name, form.server],
  );

  // The submitted timezone may not be in the curated list; keep it selectable.
  const tzKnown = Object.values(timezones).some(list => list.some(t => t.timezone === form.timezone));

  // Server: the submit-form regions, then other spellings already in the catalog, then free text.
  const listedValues = useMemo(() => new Set(SUBMIT_SERVER_OPTIONS.map(o => o.value)), []);
  const catalogServers = useMemo(() => servers.filter(s => !listedValues.has(s)).sort(), [servers, listedValues]);
  const [serverOther, setServerOther] = useState(false);
  const serverInList = listedValues.has(form.server) || catalogServers.includes(form.server);
  const showServerInput = serverOther || (!serverInList && servers.length > 0);

  // Same moment written on another clock: lets "Europe/Moscow 23:00" become "Etc/UTC 20:00".
  const normalizeTo = (tz: string) => {
    const t = resetInZone(form.timezone, form.daily_reset, tz);
    if (t) setForm(f => ({ ...f, timezone: tz, daily_reset: t }));
  };
  const submittedDiff = resetDiffMinutes(original, form);
  const clockChoices = useMemo(() => {
    const zones = new Set<string>(['Etc/UTC']);
    similar?.forEach(g => zones.add(g.timezone));
    zones.delete(form.timezone);
    return [...zones].slice(0, 4);
  }, [similar, form.timezone]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const clearIcon = () => {
    previewSeq.current++;
    setIconBusy(false);
    setIconFile(null);
    setIconPreview(null);
    setIconError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const approve = async (activate: boolean) => {
    setSaving(activate ? 'active' : 'inactive');
    setError('');
    try {
      const res = await approveSubmission(
        token,
        submission.id,
        { ...form, name: form.name.trim(), server: form.server.trim(), activate, icon: iconPreview ? iconFile : null, fit },
        notes.trim() || undefined,
      );
      onDone(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Approve failed');
      setSaving(null);
    }
  };

  const previewGame = {
    id: -1,
    name: form.name.trim() || 'Untitled game',
    server: form.server.trim() || '—',
    timezone: form.timezone,
    daily_reset: form.daily_reset.length === 5 ? `${form.daily_reset}:00` : form.daily_reset,
    icon_name: '',
    last_verified: '',
  };
  const previewIconSrc = iconPreview?.url ?? '/placeholder.svg';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4" onClick={() => !saving && onClose()}>
      <div
        className="mx-auto my-6 w-full max-w-5xl rounded-xl p-5 sm:p-6"
        style={{ border: '1px solid rgba(200,155,60,0.15)', background: 'var(--bg2)' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="review-title" className="text-base font-semibold text-white">Review submission #{submission.id}</h2>
            <p className="text-xs text-zinc-500">
              From a {submission.submitter_role_name} · {new Date(submission.created_at).toLocaleDateString()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!!saving}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-sm text-[#9a8570] hover:text-[#f0ede8]"
          >
            ✕
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          {/* ── Left: fields + icon ── */}
          <div className="space-y-4">
            {submission.notes && (
              <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                <p className="mb-1 text-xs" style={{ color: 'var(--text3)' }}>Submitter notes</p>
                <p className="whitespace-pre-wrap" style={{ color: 'var(--text2)' }}>{submission.notes}</p>
              </div>
            )}

            <div>
              <Label>Name</Label>
              <input value={form.name} onChange={set('name')} maxLength={255}
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none" style={inputStyle} onFocus={focusOn} onBlur={focusOff} />
              <Original value={original.name} current={form.name} />
            </div>

            <div>
              <Label>Server</Label>
              <select
                value={showServerInput ? '__other__' : form.server}
                onChange={e => {
                  if (e.target.value === '__other__') { setServerOther(true); return; }
                  setServerOther(false);
                  setForm(f => ({ ...f, server: e.target.value }));
                }}
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none" style={inputStyle} onFocus={focusOn} onBlur={focusOff}>
                <optgroup label="Regions" style={{ background: 'var(--bg2)' }}>
                  {SUBMIT_SERVER_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ background: 'var(--bg2)' }}>{o.label}</option>)}
                </optgroup>
                {catalogServers.length > 0 && (
                  <optgroup label="Other spellings in the catalog" style={{ background: 'var(--bg2)' }}>
                    {catalogServers.map(s => <option key={s} value={s} style={{ background: 'var(--bg2)' }}>{s}</option>)}
                  </optgroup>
                )}
                <option value="__other__" style={{ background: 'var(--bg2)' }}>Type a new one…</option>
              </select>
              {showServerInput && (
                <input value={form.server} onChange={set('server')} maxLength={100} placeholder="New server name"
                  className="mt-2 w-full rounded-lg px-3 py-2 text-sm text-white outline-none" style={inputStyle} onFocus={focusOn} onBlur={focusOff} />
              )}
              <p className="mt-1 text-xs" style={{ color: 'var(--text3)' }}>
                Shows as <span style={{ color: 'var(--text2)' }}>{displayServer(form.server.trim() || '—')}</span>.
                {showServerInput && ' Not a listed region: prefer one of the list where it fits.'}
              </p>
              <Original value={original.server} current={form.server} />
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div>
                <Label>Timezone</Label>
                <select value={form.timezone} onChange={set('timezone')}
                  className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none" style={inputStyle} onFocus={focusOn} onBlur={focusOff}>
                  {!tzKnown && <option value={form.timezone}>{form.timezone}</option>}
                  {Object.entries(timezones).map(([region, entries]) => (
                    <optgroup key={region} label={region} style={{ background: 'var(--bg2)' }}>
                      {entries.map(t => (
                        <option key={t.timezone} value={t.timezone} style={{ background: 'var(--bg2)' }}>
                          {t.label} ({t.offset})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <Original value={original.timezone} current={form.timezone} />
              </div>
              <div>
                <Label>Daily reset</Label>
                <input type="time" value={form.daily_reset} onChange={set('daily_reset')}
                  className="rounded-lg px-3 py-2 text-sm text-white outline-none [color-scheme:dark]" style={inputStyle} onFocus={focusOn} onBlur={focusOff} />
                <Original value={original.daily_reset} current={form.daily_reset} />
              </div>
            </div>
            <div className="-mt-2 space-y-1.5">
              <p className="font-mono text-xs" style={{ color: 'var(--gold-bright)' }}>
                = {resetUtc(form.timezone, form.daily_reset)}
                {resetLocal(form.timezone, form.daily_reset) && ` · ${resetLocal(form.timezone, form.daily_reset)} your time`}
              </p>
              {submittedDiff !== null && submittedDiff !== 0 && (
                <p className="text-xs" style={{ color: 'var(--text3)' }}>
                  Submitted moment: {resetUtc(original.timezone, original.daily_reset)} ({describeResetDiff(-submittedDiff)} than the edit)
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: 'var(--text3)' }}>
                <span>Same moment on:</span>
                {clockChoices.map(tz => (
                  <button key={tz} type="button" onClick={() => normalizeTo(tz)}
                    title={`Rewrite as ${tz} ${resetInZone(form.timezone, form.daily_reset, tz) ?? ''}`}
                    className="rounded border border-[rgba(200,155,60,0.15)] px-2 py-0.5 text-[#9a8570] hover:text-[#f0ede8]">
                    {zoneCity(tz)} {resetInZone(form.timezone, form.daily_reset, tz)}
                  </button>
                ))}
              </div>
            </div>

            {/* Icon */}
            <div>
              <Label>Icon (optional)</Label>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-[72px] w-[72px] flex-shrink-0 items-center justify-center overflow-hidden rounded-lg"
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewIconSrc} alt="" width={72} height={72} style={{ aspectRatio: '1/1', opacity: iconBusy ? 0.4 : 1 }} />
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => fileRef.current?.click()}
                      className="rounded-lg border border-[rgba(200,155,60,0.15)] px-3 py-1.5 text-xs text-[#9a8570] hover:text-[#f0ede8]">
                      {iconFile ? 'Change file' : 'Choose file'}
                    </button>
                    {iconFile && (
                      <button type="button" onClick={clearIcon} className="rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300">
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="flex w-fit overflow-hidden rounded-lg border border-[rgba(200,155,60,0.15)] text-xs" role="group" aria-label="Icon fit">
                    {(['cover', 'contain'] as const).map(f => (
                      <button key={f} type="button" onClick={() => { setFit(f); if (iconFile) runPreview(iconFile, f); }} aria-pressed={fit === f}
                        className={`px-3 py-1.5 ${fit === f ? 'bg-[rgba(200,155,60,0.15)] text-[#e8c86a]' : 'text-[#9a8570] hover:text-[#f0ede8]'}`}>
                        {f === 'cover' ? 'Crop' : 'Pad'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) { setIconFile(f); runPreview(f, fit); } }} />
              <p className="mt-2 text-xs" style={{ color: 'var(--text3)' }}>
                PNG, JPEG, WebP or GIF up to 2 MB. Re-encoded to a 96×96 WebP on the server; this preview is the real output.
                {iconPreview && ` ${(iconPreview.bytes / 1024).toFixed(1)} KB${iconPreview.animated ? ', animated' : ''}.`}
              </p>
              {iconError && <p className="mt-1 text-xs text-red-400">{iconError}</p>}
            </div>

            <div>
              <Label>Review notes (optional)</Label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="What you changed or checked…"
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none" style={inputStyle} onFocus={focusOn} onBlur={focusOff} />
            </div>
          </div>

          {/* ── Right: duplicates + live preview ── */}
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Similar games already in the catalog</p>
              {similar === null ? (
                <div className="h-10 animate-pulse rounded-lg bg-[#18140d]" />
              ) : similar.length === 0 ? (
                <p className="text-sm text-zinc-500">No close matches.</p>
              ) : (
                <ul className="space-y-1.5">
                  {similar.map(g => {
                    const isExact = g === exactDupe;
                    const diff = resetDiffMinutes(form, g);
                    return (
                      <li key={g.id} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm"
                        style={{ background: isExact ? 'rgba(127,29,29,0.25)' : 'var(--bg3)', border: `1px solid ${isExact ? 'rgba(248,113,113,0.4)' : 'var(--border)'}` }}>
                        <div style={{ width: 24, height: 24, flexShrink: 0 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={gameIconSrc(g.icon_name)} alt="" width={24} height={24} className="rounded" style={{ aspectRatio: '1/1' }}
                            onError={e => { (e.currentTarget as HTMLImageElement).src = '/placeholder.svg'; }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-white">{g.name} <span className="text-zinc-500">· {g.server}</span></p>
                          <p className="text-xs text-zinc-500">
                            resets {resetUtc(g.timezone, g.daily_reset)}
                            {diff !== null && (
                              <span style={{ color: diff === 0 ? 'var(--gold-bright)' : 'var(--text2)' }}> · {describeResetDiff(diff)}</span>
                            )}
                            <span className="text-zinc-600"> · {g.timezone} {g.daily_reset.slice(0, 5)}</span>
                            {!g.is_active && ' · inactive'}
                          </p>
                        </div>
                        <span className={`flex-shrink-0 text-xs ${isExact ? 'text-red-400' : 'text-zinc-500'}`}>
                          {isExact ? 'Same name + server' : `${Math.round(g.score * 100)}%`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Preview: games browser</p>
              <div className="max-w-xs">
                <GameCard game={previewGame} isTracked={false} onAdd={noop} onRemove={noop} iconSrc={previewIconSrc} />
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Preview: My List</p>
              <DashboardCard
                game={{
                  game_id: -1,
                  name: previewGame.name,
                  server: previewGame.server,
                  timezone: previewGame.timezone,
                  daily_reset: previewGame.daily_reset,
                  icon_name: '',
                  completed_today: false,
                }}
                onToggleComplete={noop}
                onRemove={noop}
                iconSrc={previewIconSrc}
              />
            </div>
          </div>
        </div>

        {error && <p className="mt-5 rounded-lg bg-red-950 px-3 py-2 text-sm text-red-400">{error}</p>}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={!!saving}
            className="rounded-lg border border-[rgba(200,155,60,0.15)] px-4 py-2 text-sm text-[#9a8570] hover:text-[#f0ede8]">
            Cancel
          </button>
          <button type="button" onClick={() => approve(false)} disabled={!!saving || iconBusy || !!exactDupe}
            className="rounded-lg border border-[rgba(200,155,60,0.28)] px-4 py-2 text-sm text-[#e8c86a] hover:bg-[rgba(200,155,60,0.08)] disabled:opacity-50">
            {saving === 'inactive' ? 'Approving…' : 'Approve as inactive'}
          </button>
          <button type="button" onClick={() => approve(true)} disabled={!!saving || iconBusy || !!exactDupe}
            className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}>
            {saving === 'active' ? 'Approving…' : 'Approve & activate'}
          </button>
        </div>
      </div>
    </div>
  );
}
