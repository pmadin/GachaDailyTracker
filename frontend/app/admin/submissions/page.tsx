'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useAuth } from '../../_context/AuthContext';
import Pagination from '../../_components/Pagination';
import SortIcon, { type SortDir } from '../../_components/SortIcon';
import { sortRows } from '../../_lib/sort';
import {
  fetchAdminSubmissions,
  reviewSubmission,
  type GameSubmission,
} from '../../_lib/api';

const PAGE_SIZE = 20;

type SortCol = 'name' | 'server' | 'timezone' | 'daily_reset' | 'submitter_role' | 'created_at';

const STATUS_TABS = ['pending', 'approved', 'rejected', 'all'] as const;
type StatusFilter = (typeof STATUS_TABS)[number];

const ROLE_COLORS: Record<number, string> = {
  1: 'text-zinc-400 bg-zinc-800',
  2: 'text-amber-400 bg-amber-950',
  3: 'text-[#e8c86a] bg-[rgba(200,155,60,0.15)]',
  4: 'text-[#c8913c] bg-[rgba(200,155,60,0.25)]',
};

const STATUS_BADGE: Record<string, string> = {
  pending:  'text-zinc-400 bg-zinc-800',
  approved: 'text-emerald-400 bg-emerald-950/60',
  rejected: 'text-red-400 bg-red-950',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// ─── Review Modal ─────────────────────────────────────────────────────────────
function ReviewModal({
  submission,
  action,
  onConfirm,
  onClose,
}: {
  submission: GameSubmission;
  action: 'approve' | 'reject';
  onConfirm: (notes: string) => Promise<void>;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onConfirm(notes.trim());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed');
      setSaving(false);
    }
  };

  const isApprove = action === 'approve';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-sm rounded-xl p-6"
        style={{ border: '1px solid rgba(200,155,60,0.15)', background: 'var(--bg2)' }}
      >
        <h2 className={`mb-1 text-base font-semibold ${isApprove ? 'text-white' : 'text-red-400'}`}>
          {isApprove ? 'Approve submission?' : 'Reject submission?'}
        </h2>
        <p className="mb-4 text-sm text-zinc-400">
          <span className="text-white">{submission.name}</span>
          <span className="text-zinc-500"> · {submission.server}</span>
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">
              Review notes (optional)
            </label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={isApprove ? 'Any notes for the record…' : 'Reason for rejection…'}
              className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
              style={{ border: '1px solid rgba(200,155,60,0.15)', background: 'var(--surface)' }}
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
              className={`flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-50 ${
                isApprove
                  ? 'bg-emerald-700 text-white hover:bg-emerald-600'
                  : 'bg-red-700 text-white hover:bg-red-600'
              }`}
            >
              {saving
                ? isApprove ? 'Approving…' : 'Rejecting…'
                : isApprove ? 'Approve' : 'Reject'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminSubmissionsPage() {
  const { token } = useAuth();

  const [submissions, setSubmissions] = useState<GameSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [reviewTarget, setReviewTarget] = useState<{ sub: GameSubmission; action: 'approve' | 'reject' } | null>(null);
  const [lastActionMsg, setLastActionMsg] = useState('');
  const [lastActionApproved, setLastActionApproved] = useState(false);
  const [expandedCell, setExpandedCell] = useState<{ id: number; field: 'notes' | 'review' } | null>(null);

  // Matches the server's default ORDER BY gs.created_at DESC so the table doesn't
  // visibly re-order itself on first load.
  const [sortCol, setSortCol] = useState<SortCol>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const sortedSubmissions = sortRows(submissions, s => s[sortCol], sortDir);

  const isExpanded = (id: number, field: 'notes' | 'review') =>
    expandedCell?.id === id && expandedCell.field === field;
  const toggleExpand = (id: number, field: 'notes' | 'review') =>
    setExpandedCell(prev => (prev?.id === id && prev.field === field ? null : { id, field }));

  const loadPendingCount = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetchAdminSubmissions(token, { status: 'pending', limit: 1 });
      setPendingCount(res.total);
    } catch { /* silent */ }
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setListError('');
    try {
      const res = await fetchAdminSubmissions(token, {
        status: statusFilter,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setSubmissions(res.submissions);
      setTotal(res.total);
      if (statusFilter === 'pending') setPendingCount(res.total);
    } catch (err: unknown) {
      setListError(err instanceof Error ? err.message : 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (statusFilter !== 'pending') loadPendingCount();
  }, [statusFilter, loadPendingCount]);

  const handleReview = async (notes: string) => {
    if (!token || !reviewTarget) return;
    const { sub, action } = reviewTarget;
    const res = await reviewSubmission(token, sub.id, action, notes || undefined);
    setReviewTarget(null);
    setLastActionMsg(res.message);
    setLastActionApproved(action === 'approve');
    await load();
    await loadPendingCount();
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const tabLabel = (s: StatusFilter) => {
    if (s === 'pending') return `Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}`;
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Game Submissions</h1>
        <p className="text-sm text-zinc-500">{total} {statusFilter === 'all' ? 'total' : statusFilter}</p>
      </div>

      {/* Action result message */}
      {lastActionMsg && (
        <div className="mb-4 space-y-2">
          <p className="rounded-lg bg-emerald-950/60 px-4 py-2 text-sm text-emerald-400">
            {lastActionMsg}
          </p>
          {lastActionApproved && (
            <p className="rounded-lg px-4 py-2 text-sm text-zinc-400" style={{ border: '1px solid rgba(200,155,60,0.15)', background: 'var(--bg2)' }}>
              Go to the{' '}
              <a href="/admin/games" className="underline" style={{ color: 'var(--gold)' }}>
                Games panel
              </a>{' '}
              to activate it when ready.
            </p>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div className="mb-4 flex w-fit overflow-hidden rounded-lg border border-[rgba(200,155,60,0.15)] text-sm">
        {STATUS_TABS.map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(0); setLastActionMsg(''); }}
            className={`px-3 py-2 transition-colors ${
              statusFilter === s
                ? 'bg-[rgba(200,155,60,0.15)] text-[#e8c86a]'
                : 'text-[#9a8570] hover:text-[#f0ede8]'
            }`}
          >
            {tabLabel(s)}
          </button>
        ))}
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
                  { col: 'name' as SortCol, label: 'Game', cls: '' },
                  { col: 'server' as SortCol, label: 'Server', cls: '' },
                  { col: 'timezone' as SortCol, label: 'Timezone', cls: 'hidden md:table-cell' },
                  { col: 'daily_reset' as SortCol, label: 'Reset', cls: '' },
                  { col: 'submitter_role' as SortCol, label: 'By', cls: '' },
                ] as { col: SortCol; label: string; cls: string }[]
              ).map(({ col, label, cls }) => (
                <th key={col} className={`px-4 py-3 font-medium ${cls}`}>
                  <button
                    onClick={() => handleSort(col)}
                    className="flex items-center whitespace-nowrap hover:text-zinc-300 transition-colors"
                  >
                    {label}
                    <SortIcon active={sortCol === col} dir={sortDir} />
                  </button>
                </th>
              ))}
              <th className="hidden px-4 py-3 font-medium lg:table-cell">Notes</th>
              <th className="px-4 py-3 font-medium">
                <button
                  onClick={() => handleSort('created_at')}
                  className="flex items-center whitespace-nowrap hover:text-zinc-300 transition-colors"
                >
                  Date
                  <SortIcon active={sortCol === 'created_at'} dir={sortDir} />
                </button>
              </th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-[rgba(200,155,60,0.06)]">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3 animate-pulse rounded bg-[#18140d]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : submissions.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-zinc-500">
                  No {statusFilter === 'all' ? '' : statusFilter} submissions
                </td>
              </tr>
            ) : (
              sortedSubmissions.map(sub => (
                <tr
                  key={sub.id}
                  className="border-b border-[rgba(200,155,60,0.06)] transition-colors hover:bg-[rgba(200,155,60,0.04)]"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{sub.name}</div>
                    {sub.status !== 'pending' && (
                      <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE[sub.status]}`}>
                        {sub.status}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{sub.server}</td>
                  <td className="hidden px-4 py-3 text-xs text-zinc-500 md:table-cell">{sub.timezone}</td>
                  <td className="px-4 py-3 font-mono text-zinc-300">{sub.daily_reset}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${ROLE_COLORS[sub.submitter_role] ?? 'text-zinc-400 bg-zinc-800'}`}>
                      {sub.submitter_role_name}
                    </span>
                  </td>
                  <td
                    className={`hidden px-4 py-3 text-xs text-zinc-500 lg:table-cell ${sub.notes ? 'cursor-pointer hover:text-zinc-300' : ''}`}
                    style={isExpanded(sub.id, 'notes') ? { whiteSpace: 'normal', maxWidth: 280 } : { maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    onClick={() => sub.notes && toggleExpand(sub.id, 'notes')}
                    title={!isExpanded(sub.id, 'notes') && sub.notes ? sub.notes : undefined}
                  >
                    {sub.notes ?? <span className="text-zinc-700">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {formatDate(sub.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    {sub.status === 'pending' ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setLastActionMsg(''); setReviewTarget({ sub, action: 'approve' }); }}
                          className="rounded px-2 py-1 text-xs text-emerald-400 transition-colors hover:bg-emerald-950/60"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => { setLastActionMsg(''); setReviewTarget({ sub, action: 'reject' }); }}
                          className="rounded px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-950"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-600">
                        {sub.review_notes && (
                          <span
                            className="cursor-pointer text-zinc-500 hover:text-zinc-300"
                            style={isExpanded(sub.id, 'review') ? { whiteSpace: 'normal', display: 'block', maxWidth: 200 } : undefined}
                            title={!isExpanded(sub.id, 'review') ? sub.review_notes : undefined}
                            onClick={() => toggleExpand(sub.id, 'review')}
                          >
                            {isExpanded(sub.id, 'review')
                              ? sub.review_notes
                              : sub.review_notes.length > 30
                                ? sub.review_notes.slice(0, 30) + '…'
                                : sub.review_notes}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {reviewTarget && (
        <ReviewModal
          submission={reviewTarget.sub}
          action={reviewTarget.action}
          onConfirm={handleReview}
          onClose={() => setReviewTarget(null)}
        />
      )}
    </>
  );
}
