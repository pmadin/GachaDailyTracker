/** "1,284" under 1000, "12.9K" / "4.2M" above — for stat tiles and chart axis ticks. */
export function formatCompact(n: number): string {
  if (Math.abs(n) < 1000) return n.toLocaleString('en-US');
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
