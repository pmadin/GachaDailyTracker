'use client';

import { useState, useEffect, useCallback, useRef, FormEvent } from 'react';
import { useAuth } from '../../_context/AuthContext';
import Pagination from '../../_components/Pagination';
import SortIcon, { type SortDir } from '../../_components/SortIcon';
import { sortRows } from '../../_lib/sort';
import {
  fetchAdminGames,
  createAdminGame,
  updateAdminGame,
  softDeleteGame,
  restoreGame,
  hardDeleteGame,
  patchIcons,
  uploadGameIcon,
  type AdminGame,
  type GamePayload,
} from '../../_lib/api';
import SubmissionsBadge from '../_components/SubmissionsBadge';

const PAGE_SIZE = 50;

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Shape returned by POST /gdt/admin/import/games (see gameSyncService.ts SyncReport).
interface SyncReport {
  dry_run: boolean;
  total: number;
  added: number;
  updated: number;
  reactivated: number;
  renamed: number;
  deactivated: number;
  unchanged: number;
  skipped_deactivations: { id: number; name: string; server: string; tracked_by: number }[];
  rename_conflicts: { from: string; to: string; reason: string }[];
  invalid_entries: string[];
  details: {
    added: string[];
    updated: { name: string; server: string; changes: string[] }[];
    renamed: { id: number; from: string; to: string; tracked_by: number }[];
    deactivated: string[];
  };
  last_synced_at: string | null;
}

// Kept local to this page (the shared api client has a fixed, older response type for this route).
async function runUpstreamSync(token: string, dryRun: boolean): Promise<SyncReport> {
  const res = await fetch(`${API}/gdt/admin/import/games${dryRun ? '?dryRun=true' : ''}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? body.details ?? res.statusText);
  return body as SyncReport;
}

function SyncReportPanel({ report }: { report: SyncReport }) {
  const stat = (n: number, label: string) => (
    <span key={label} className="text-zinc-400">
      <span style={{ color: n > 0 ? '#e8c86a' : undefined }}>{n}</span> {label}
    </span>
  );
  const list = (title: string, items: string[]) =>
    items.length > 0 && (
      <details className="mt-1">
        <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">
          {title} ({items.length})
        </summary>
        <ul className="ml-4 mt-1 list-disc space-y-0.5 text-zinc-500">
          {items.map(i => <li key={i}>{i}</li>)}
        </ul>
      </details>
    );

  return (
    <div className="mt-3 rounded-lg p-3 text-xs" style={{ border: '1px solid rgba(200,155,60,0.10)', background: 'var(--surface)' }}>
      <p className="mb-1 font-semibold text-zinc-300">
        {report.dry_run ? 'Preview — nothing was changed' : 'Sync complete'} · {report.total} games upstream
      </p>
      <p className="flex flex-wrap gap-x-3 gap-y-1">
        {stat(report.added, 'added')}
        {stat(report.updated, 'updated')}
        {stat(report.renamed, 'renamed')}
        {stat(report.deactivated, report.dry_run ? 'to deactivate' : 'deactivated')}
        {stat(report.skipped_deactivations.length, 'kept (still tracked)')}
        {stat(report.unchanged, 'unchanged')}
      </p>

      {report.skipped_deactivations.length > 0 && (
        <div className="mt-2 rounded-md p-2" style={{ border: '1px solid rgba(200,155,60,0.28)' }}>
          <p style={{ color: '#e8c86a' }}>
            No longer listed upstream, but kept active because users track them — review these:
          </p>
          <ul className="ml-4 mt-1 list-disc text-zinc-400">
            {report.skipped_deactivations.map(g => (
              <li key={g.id}>
                {g.name} <span className="text-zinc-500">({g.server})</span> — {g.tracked_by} user{g.tracked_by === 1 ? '' : 's'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.rename_conflicts.length > 0 &&
        list('Rename conflicts (skipped)', report.rename_conflicts.map(c => `${c.from} → ${c.to}: ${c.reason}`))}
      {list('Renamed in place (tracking preserved)', report.details.renamed.map(r => `${r.from} → ${r.to} (${r.tracked_by} tracking)`))}
      {list('Added', report.details.added)}
      {list('Updated', report.details.updated.map(u => `${u.name} (${u.server}): ${u.changes.join('; ')}`))}
      {list(report.dry_run ? 'Would deactivate (no one tracks these)' : 'Deactivated (no one tracked these)', report.details.deactivated)}
      {list('Skipped invalid upstream entries', report.invalid_entries)}
    </div>
  );
}

type SortCol = 'name' | 'server' | 'timezone' | 'daily_reset' | 'tracked_by' | 'is_active';

// ─── Game form modal (add + edit) ─────────────────────────────────────────────
function GameFormModal({
  game,
  onSave,
  onClose,
}: {
  game: AdminGame | null;
  onSave: (data: GamePayload) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: game?.name ?? '',
    server: game?.server ?? '',
    timezone: game?.timezone ?? 'America/Los_Angeles',
    daily_reset: game?.daily_reset ?? '04:00',
    icon_name: game?.icon_name ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const field =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload: GamePayload = {
        name: form.name.trim(),
        server: form.server.trim(),
        timezone: form.timezone.trim(),
        daily_reset: form.daily_reset.trim(),
      };
      if (form.icon_name.trim()) payload.icon_name = form.icon_name.trim();
      await onSave(payload);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setSaving(false);
    }
  };

  const fields: { label: string; key: keyof typeof form; placeholder: string; required: boolean }[] = [
    { label: 'Name', key: 'name', placeholder: 'Genshin Impact', required: true },
    { label: 'Server', key: 'server', placeholder: 'Global', required: true },
    { label: 'Timezone', key: 'timezone', placeholder: 'America/Los_Angeles', required: true },
    { label: 'Daily Reset (HH:MM)', key: 'daily_reset', placeholder: '04:00', required: true },
    { label: 'Icon name (optional)', key: 'icon_name', placeholder: 'genshin-impact', required: false },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl p-6" style={{ border: '1px solid rgba(200,155,60,0.15)', background: 'var(--bg2)' }}>
        <h2 className="mb-5 text-base font-semibold text-white">
          {game ? 'Edit Game' : 'Add Game'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          {fields.map(({ label, key, placeholder, required }) => (
            <div key={key}>
              <label className="mb-1 block text-xs text-zinc-400">{label}</label>
              <input
                value={form[key]}
                onChange={field(key)}
                required={required}
                placeholder={placeholder}
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                style={{ border: '1px solid rgba(200,155,60,0.15)', background: 'var(--surface)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.15)')}
              />
            </div>
          ))}
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
              {saving ? 'Saving…' : game ? 'Save changes' : 'Add game'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Hard-delete confirmation modal ───────────────────────────────────────────
function ConfirmDeleteModal({
  game,
  onConfirm,
  onClose,
}: {
  game: AdminGame;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-red-900/60 bg-zinc-900 p-6">
        <h2 className="mb-2 text-base font-semibold text-red-400">Permanently delete game?</h2>
        <p className="mb-1 text-sm text-zinc-300">
          {game.name}{' '}
          <span className="text-zinc-500">({game.server})</span>
        </p>
        <p className="mb-5 text-xs text-zinc-500">
          This removes the game and all user tracking data. It cannot be undone.
        </p>
        {error && (
          <p className="mb-3 rounded-lg bg-red-950 px-3 py-2 text-sm text-red-400">{error}</p>
        )}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-[rgba(200,155,60,0.15)] py-2 text-sm text-[#9a8570] hover:text-[#f0ede8]"
          >
            Cancel
          </button>
          <button
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              setError('');
              try {
                await onConfirm();
              } catch (err: unknown) {
                setError(err instanceof Error ? err.message : 'Delete failed');
                setLoading(false);
              }
            }}
            className="flex-1 rounded-lg bg-red-700 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
          >
            {loading ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminGamesPage() {
  const { token, user } = useAuth();

  const [games, setGames] = useState<AdminGame[]>([]);
  const [total, setTotal] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [editGame, setEditGame] = useState<AdminGame | null>(null);
  const [addingGame, setAddingGame] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AdminGame | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState('');
  const [syncReport, setSyncReport] = useState<SyncReport | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [patchLoading, setPatchLoading] = useState(false);
  const [patchResult, setPatchResult] = useState('');

  const iconInputRef = useRef<HTMLInputElement>(null);
  const [iconTargetId, setIconTargetId] = useState<number | null>(null);

  const [sortCol, setSortCol] = useState<SortCol>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const sortedGames = sortRows(games, g => g[sortCol], sortDir);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setListError('');
    try {
      const res = await fetchAdminGames(token, {
        search: submittedSearch || undefined,
        active: filter === 'all' ? undefined : filter === 'active',
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setGames(res.games);
      setTotal(res.total);
      setActiveCount(res.activeCount);
      if (res.last_synced_at) {
        setLastSynced(new Date(res.last_synced_at).toLocaleString());
      }
    } catch (err: unknown) {
      setListError(err instanceof Error ? err.message : 'Failed to load games');
    } finally {
      setLoading(false);
    }
  }, [token, submittedSearch, filter, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = setTimeout(() => {
      setPage(0);
      setSubmittedSearch(search);
    }, 400);
    return () => clearTimeout(id);
  }, [search]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setPage(0);
    setSubmittedSearch(search);
  };

  const handleSave = async (data: GamePayload) => {
    if (!token) return;
    if (editGame) {
      await updateAdminGame(token, editGame.id, data);
    } else {
      await createAdminGame(token, data);
    }
    await load();
  };

  const handleToggleActive = async (game: AdminGame) => {
    if (!token) return;
    setActionLoading(game.id);
    try {
      if (game.is_active) {
        await softDeleteGame(token, game.id);
      } else {
        await restoreGame(token, game.id);
      }
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleHardDelete = async () => {
    if (!token || !confirmDelete) return;
    await hardDeleteGame(token, confirmDelete.id);
    setConfirmDelete(null);
    await load();
  };

  const handleImport = async () => {
    if (!token) return;
    setImportLoading(true);
    setImportResult('');
    setSyncReport(null);
    try {
      const res = await runUpstreamSync(token, false);
      setSyncReport(res);
      if (res.last_synced_at) setLastSynced(new Date(res.last_synced_at).toLocaleString());
      await load();
    } catch (err: unknown) {
      setImportResult(`Error: ${err instanceof Error ? err.message : 'Import failed'}`);
    } finally {
      setImportLoading(false);
    }
  };

  const handlePreview = async () => {
    if (!token) return;
    setPreviewLoading(true);
    setImportResult('');
    setSyncReport(null);
    try {
      setSyncReport(await runUpstreamSync(token, true));
    } catch (err: unknown) {
      setImportResult(`Error: ${err instanceof Error ? err.message : 'Preview failed'}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePatchIcons = async () => {
    if (!token) return;
    setPatchLoading(true);
    setPatchResult('');
    try {
      const res = await patchIcons(token);
      setPatchResult(
        res.missing_icon_name_count === 0
          ? 'All active games have icon names set.'
          : `${res.missing_icon_name_count} game(s) missing icon_name: ${res.missing_games.map(g => g.name).join(', ')}`
      );
    } catch (err: unknown) {
      setPatchResult(`Error: ${err instanceof Error ? err.message : 'Audit failed'}`);
    } finally {
      setPatchLoading(false);
    }
  };

  const handleIconFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !iconTargetId || !token) return;
    try {
      await uploadGameIcon(token, iconTargetId, file);
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Icon upload failed');
    } finally {
      e.target.value = '';
      setIconTargetId(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      {/* Hidden file input for icon uploads */}
      <input
        ref={iconInputRef}
        type="file"
        accept=".gif"
        className="hidden"
        onChange={handleIconFileChange}
      />

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Games</h1>
          <p className="text-sm text-zinc-500">{activeCount} active · {total} total</p>
        </div>
        <button
          onClick={() => setAddingGame(true)}
          className="rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
        >
          + Add game
        </button>
      </div>

      {token && <SubmissionsBadge token={token} />}

      {/* Import / icon tools */}
      <div className="mb-6 rounded-xl p-4" style={{ border: '1px solid rgba(200,155,60,0.10)', background: 'var(--bg2)' }}>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Data &amp; Icons
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handlePreview}
            disabled={previewLoading || importLoading || patchLoading}
            className="rounded-lg border border-[rgba(200,155,60,0.15)] px-3 py-1.5 text-sm text-[#9a8570] transition-colors hover:border-[rgba(200,155,60,0.3)] hover:text-[#f0ede8] disabled:opacity-40"
          >
            {previewLoading ? 'Checking…' : 'Preview changes'}
          </button>
          <button
            onClick={handleImport}
            disabled={importLoading || previewLoading || patchLoading}
            className="rounded-lg border border-[rgba(200,155,60,0.15)] px-3 py-1.5 text-sm text-[#9a8570] transition-colors hover:border-[rgba(200,155,60,0.3)] hover:text-[#f0ede8] disabled:opacity-40"
          >
            {importLoading ? 'Syncing…' : 'Sync from upstream'}
          </button>
          <button
            onClick={handlePatchIcons}
            disabled={patchLoading || importLoading || previewLoading}
            className="rounded-lg border border-[rgba(200,155,60,0.15)] px-3 py-1.5 text-sm text-[#9a8570] transition-colors hover:border-[rgba(200,155,60,0.3)] hover:text-[#f0ede8] disabled:opacity-40"
          >
            {patchLoading ? 'Auditing…' : 'Verify Icons'}
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-600">
          Icons are served directly from the Game-Time-Master repository. Use &quot;Verify Icons&quot; to check which games are missing icon references in the database.
        </p>
        {importResult && (
          <p className={`mt-2 text-xs ${importResult.startsWith('Error') ? 'text-red-400' : 'text-zinc-400'}`}>{importResult}</p>
        )}
        {syncReport && <SyncReportPanel report={syncReport} />}
        {lastSynced && (
          <p className="mt-1 text-xs text-zinc-500">
            Last synced from upstream: <span className="text-zinc-400">{lastSynced}</span>
          </p>
        )}
        {patchResult && (
          <p className={`mt-1 text-xs ${patchResult.startsWith('Error') ? 'text-red-400' : 'text-zinc-400'}`}>
            {patchResult}
          </p>
        )}
      </div>

      {/* Search + filter */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form onSubmit={handleSearch} className="flex flex-1 gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or server…"
            className="flex-1 rounded-lg px-3 py-2 text-sm text-white outline-none"
            style={{ border: '1px solid rgba(200,155,60,0.15)', background: 'var(--surface)' }}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.55)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(200,155,60,0.15)')}
          />
          <button
            type="submit"
            className="rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #c8913c, #e8c86a)', color: '#0a0808' }}
          >
            Search
          </button>
        </form>
        <div className="flex overflow-hidden rounded-lg border border-[rgba(200,155,60,0.15)] text-sm">
          {(['all', 'active', 'inactive'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(0); }}
              className={`px-3 py-2 capitalize transition-colors ${
                filter === f ? 'bg-[rgba(200,155,60,0.15)] text-[#e8c86a]' : 'text-[#9a8570] hover:text-[#f0ede8]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {listError && (
        <p className="mb-4 rounded-lg bg-red-950 px-4 py-2 text-sm text-red-400">{listError}</p>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[rgba(200,155,60,0.10)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgba(200,155,60,0.10)] bg-[rgba(13,11,8,0.8)] text-left text-xs text-[#4a3d2a]">
              {(
                [
                  { col: 'name' as SortCol, label: 'Name', cls: '' },
                  { col: 'server' as SortCol, label: 'Server', cls: '' },
                  { col: 'timezone' as SortCol, label: 'Timezone', cls: 'hidden md:table-cell' },
                  { col: 'daily_reset' as SortCol, label: 'Reset', cls: '' },
                  { col: 'tracked_by' as SortCol, label: 'Tracked', cls: 'hidden sm:table-cell' },
                ] as { col: SortCol; label: string; cls: string }[]
              ).map(({ col, label, cls }) => (
                <th
                  key={col}
                  className={`px-4 py-3 font-medium ${cls}`}
                >
                  <button
                    onClick={() => handleSort(col)}
                    className="flex items-center whitespace-nowrap hover:text-zinc-300 transition-colors"
                  >
                    {label}
                    <SortIcon active={sortCol === col} dir={sortDir} />
                  </button>
                </th>
              ))}
              <th className="px-4 py-3 font-medium">
                <button
                  onClick={() => handleSort('is_active')}
                  className="flex items-center whitespace-nowrap hover:text-zinc-300 transition-colors"
                >
                  Status
                  <SortIcon active={sortCol === 'is_active'} dir={sortDir} />
                </button>
              </th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-[rgba(200,155,60,0.06)]">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3 animate-pulse rounded bg-[#18140d]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : games.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-zinc-500">
                  No games found
                </td>
              </tr>
            ) : (
              sortedGames.map(game => (
                <tr
                  key={game.id}
                  className={`border-b border-[rgba(200,155,60,0.06)] transition-colors hover:bg-[rgba(200,155,60,0.04)] ${
                    !game.is_active ? 'opacity-50' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{game.name}</div>
                    {game.icon_name ? (
                      <div className="text-xs text-zinc-500">{game.icon_name}</div>
                    ) : (
                      <div className="text-xs text-amber-500/80">no icon</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{game.server}</td>
                  <td className="hidden px-4 py-3 text-xs text-zinc-500 md:table-cell">
                    {game.timezone}
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-300">{game.daily_reset}</td>
                  <td className="hidden px-4 py-3 text-zinc-400 sm:table-cell">{game.tracked_by}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        game.is_active
                          ? 'bg-emerald-900/30 text-emerald-400'
                          : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {game.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditGame(game)}
                        className="rounded px-2 py-1 text-xs text-[#9a8570] transition-colors hover:bg-[#18140d] hover:text-[#f0ede8]"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleActive(game)}
                        disabled={actionLoading === game.id}
                        className="rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-40"
                      >
                        {actionLoading === game.id
                          ? '…'
                          : game.is_active
                          ? 'Deactivate'
                          : 'Restore'}
                      </button>
                      <button
                        onClick={() => {
                          setIconTargetId(game.id);
                          iconInputRef.current?.click();
                        }}
                        className="rounded px-2 py-1 text-xs text-[#9a8570] transition-colors hover:bg-[#18140d] hover:text-[#f0ede8]"
                        title="Upload icon (.gif, 96×96)"
                      >
                        Icon
                      </button>
                      {user?.role === 4 && (
                        <button
                          onClick={() => setConfirmDelete(game)}
                          className="rounded px-2 py-1 text-xs text-red-500/70 transition-colors hover:bg-red-950 hover:text-red-400"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {/* Modals */}
      {(addingGame || editGame) && (
        <GameFormModal
          game={editGame}
          onSave={handleSave}
          onClose={() => { setEditGame(null); setAddingGame(false); }}
        />
      )}
      {confirmDelete && (
        <ConfirmDeleteModal
          game={confirmDelete}
          onConfirm={handleHardDelete}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
