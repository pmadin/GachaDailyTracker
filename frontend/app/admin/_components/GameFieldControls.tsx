'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchServers, fetchTimezones, type TimezoneEntry } from '../../_lib/api';
import { displayServer, SUBMIT_SERVER_OPTIONS } from '../../_lib/servers';
import { resetInZone, resetLocal, resetUtc, zoneCity } from '../../_lib/resetTime';

// Server / timezone / reset controls shared by the submission ReviewPanel and the
// add/edit game form on /admin/games, so admins pick from the same lists everywhere.

export const adminInputStyle = { border: '1px solid rgba(200,155,60,0.15)', background: 'var(--surface)' };
export const focusOn = (e: React.FocusEvent<HTMLElement>) => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)');
export const focusOff = (e: React.FocusEvent<HTMLElement>) => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.15)');
const optionBg = { background: 'var(--bg2)' };
const selectCls = 'w-full rounded-lg px-3 py-2 text-sm text-white outline-none';

/** The curated timezone list and every server spelling already in the catalog. */
export function useGameFieldData() {
  const [timezones, setTimezones] = useState<Record<string, TimezoneEntry[]>>({});
  const [servers, setServers] = useState<string[]>([]);
  useEffect(() => {
    fetchTimezones().then(setTimezones).catch(() => {});
    fetchServers().then(r => setServers(r.servers.map(s => s.server))).catch(() => {});
  }, []);
  return { timezones, servers };
}

const OTHER = '__other__';

/**
 * The submit form's regions first, then other spellings already in the catalog (legacy
 * upstream values like "America (East)"), then free text as a last resort.
 */
export function ServerSelect({ value, onChange, servers }: { value: string; onChange: (v: string) => void; servers: string[] }) {
  const listed = useMemo(() => new Set(SUBMIT_SERVER_OPTIONS.map(o => o.value)), []);
  const catalog = useMemo(() => servers.filter(s => !listed.has(s)).sort(), [servers, listed]);
  const [typing, setTyping] = useState(false);
  const known = listed.has(value) || catalog.includes(value);
  // Once the catalog has loaded, a value in neither list can only be edited as text.
  const showInput = typing || (value !== '' && !known && servers.length > 0);

  return (
    <div>
      <select
        value={showInput ? OTHER : value}
        onChange={e => {
          if (e.target.value === OTHER) { setTyping(true); return; }
          setTyping(false);
          onChange(e.target.value);
        }}
        required
        className={selectCls} style={adminInputStyle} onFocus={focusOn} onBlur={focusOff}
      >
        <option value="" disabled style={optionBg}>Pick a server…</option>
        <optgroup label="Regions" style={optionBg}>
          {SUBMIT_SERVER_OPTIONS.map(o => <option key={o.value} value={o.value} style={optionBg}>{o.label}</option>)}
        </optgroup>
        {catalog.length > 0 && (
          <optgroup label="Other spellings in the catalog" style={optionBg}>
            {catalog.map(s => <option key={s} value={s} style={optionBg}>{s}</option>)}
          </optgroup>
        )}
        <option value={OTHER} style={optionBg}>Type a new one…</option>
      </select>
      {showInput && (
        <input value={value} onChange={e => onChange(e.target.value)} maxLength={100} required placeholder="New server name"
          className={`mt-2 ${selectCls}`} style={adminInputStyle} onFocus={focusOn} onBlur={focusOff} />
      )}
      <p className="mt-1 text-xs" style={{ color: 'var(--text3)' }}>
        Shows as <span style={{ color: 'var(--text2)' }}>{displayServer(value.trim() || '—')}</span>.
        {showInput && ' Not a listed region: use one from the list where it fits.'}
      </p>
    </div>
  );
}

/** Curated timezone dropdown; a value outside the list (e.g. an old row's) stays selectable. */
export function TimezoneSelect({ value, onChange, timezones }: {
  value: string; onChange: (v: string) => void; timezones: Record<string, TimezoneEntry[]>;
}) {
  const known = Object.values(timezones).some(list => list.some(t => t.timezone === value));
  return (
    <select value={value} onChange={e => onChange(e.target.value)} required
      className={selectCls} style={adminInputStyle} onFocus={focusOn} onBlur={focusOff}>
      {!known && <option value={value} style={optionBg}>{value}</option>}
      {Object.entries(timezones).map(([region, entries]) => (
        <optgroup key={region} label={region} style={optionBg}>
          {entries.map(t => (
            <option key={t.timezone} value={t.timezone} style={optionBg}>{t.label} ({t.offset})</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function ResetTimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input type="time" value={value} onChange={e => onChange(e.target.value)} required
      className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none [color-scheme:dark]"
      style={adminInputStyle} onFocus={focusOn} onBlur={focusOff} />
  );
}

/**
 * "= 07:00 UTC · 12:00 AM your time", plus buttons that write the same moment on another
 * clock (UTC, or a sibling server's zone) so "Europe/Moscow 23:00" can become "Etc/UTC 20:00".
 */
export function ResetMoment({ timezone, dailyReset, zones = [], onRewrite }: {
  timezone: string;
  dailyReset: string;
  zones?: string[];
  onRewrite: (timezone: string, dailyReset: string) => void;
}) {
  const choices = [...new Set(['Etc/UTC', ...zones])].filter(z => z !== timezone).slice(0, 4);
  const local = resetLocal(timezone, dailyReset);
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-xs" style={{ color: 'var(--gold-bright)' }}>
        = {resetUtc(timezone, dailyReset)}{local && ` · ${local} your time`}
      </p>
      {choices.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: 'var(--text3)' }}>
          <span>Same moment on:</span>
          {choices.map(tz => {
            const t = resetInZone(timezone, dailyReset, tz);
            return (
              <button key={tz} type="button" disabled={!t} onClick={() => t && onRewrite(tz, t)}
                title={`Rewrite as ${tz} ${t ?? ''}`}
                className="rounded border border-[rgba(200,155,60,0.15)] px-2 py-0.5 text-[#9a8570] hover:text-[#f0ede8]">
                {zoneCity(tz)} {t}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
