/** "Oct 18" style date for the unverified-account deletion deadline, or null if none. */
export function formatVerifyDeadline(deadline: string | null | undefined): string | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
