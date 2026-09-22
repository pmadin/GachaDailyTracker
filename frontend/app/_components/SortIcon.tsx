'use client';

export type SortDir = 'asc' | 'desc';

// Extracted from the original admin/games sortable-header implementation so
// admin/users and admin/submissions can use the same up/down chevrons.
export default function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  const col = active ? '#e8c86a' : '#4a3d2a';
  if (!active) {
    return (
      <svg width="9" height="12" viewBox="0 0 9 12" fill="none" className="ml-1 inline-block align-middle">
        <path d="M4.5 1L8 5H1L4.5 1Z" fill={col}/>
        <path d="M4.5 11L1 7H8L4.5 11Z" fill={col}/>
      </svg>
    );
  }
  return (
    <svg width="9" height="8" viewBox="0 0 9 8" fill="none" className="ml-1 inline-block align-middle">
      {dir === 'asc' ? (
        <path d="M1 6.5L4.5 2L8 6.5" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      ) : (
        <path d="M1 1.5L4.5 6L8 1.5" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      )}
    </svg>
  );
}
