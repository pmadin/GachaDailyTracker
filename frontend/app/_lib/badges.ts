import type { SolidName } from './polyhedra';

// Mirrors src/constants/streakTiers.ts (STREAK_TIERS: key/label/days) — keep the keys/labels/
// day thresholds in sync if either changes; this repo has no shared package between src/ and
// frontend/ (see the same pattern already used for admin/analytics.ts's REGION_GROUPS vs.
// _lib/servers.ts's SERVER_GROUPS). Colors/solids are a frontend-only display concern, so
// they live here rather than being duplicated on the backend too.
//
// Palette: entirely warm gold/grey/bronze — no blue/cyan/purple anywhere (the site's anti-
// blue-tint rule isn't just about purple; see CLAUDE.md's "Warm near-black" gotcha). Iron/
// Bronze/Silver are duller, distinct hues for the early grind. Gold/Platinum/Diamond form one
// continuous escalating ramp built from the site's own tokens: Gold is literally the site's
// primary gold-gradient-button colors (--gold -> --gold-bright), Platinum continues from
// --gold-bright to the favicon's inner highlight stop (#f8e8a0), Diamond finishes at the
// favicon's lightest stop (#fdf0c0) — each tier's dark stop is the previous tier's light stop.
export interface StreakTier {
  key: 'iron' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
  label: string;
  days: number;
  solid: SolidName | 'great-stellated-dodecahedron';
  colorDark: string;
  colorLight: string;
}

export const STREAK_TIERS: StreakTier[] = [
  { key: 'iron',     label: 'Iron',     days: 7,   solid: 'tetrahedron',    colorDark: '#3f3a32', colorLight: '#8a8378' },
  { key: 'bronze',   label: 'Bronze',   days: 14,  solid: 'cube',           colorDark: '#7c4a03', colorLight: '#d97706' },
  { key: 'silver',   label: 'Silver',   days: 30,  solid: 'octahedron',     colorDark: '#86847c', colorLight: '#c4c4c0' },
  { key: 'gold',     label: 'Gold',     days: 90,  solid: 'dodecahedron',   colorDark: '#c8913c', colorLight: '#e8c86a' },
  { key: 'platinum', label: 'Platinum', days: 180, solid: 'icosahedron',    colorDark: '#e8c86a', colorLight: '#f8e8a0' },
  { key: 'diamond',  label: 'Diamond',  days: 365, solid: 'great-stellated-dodecahedron', colorDark: '#f8e8a0', colorLight: '#fdf0c0' },
];

/** Highest tier a given best-ever streak has earned, or null if under the first threshold. */
export function highestEarnedTier(streakBest: number): StreakTier | null {
  let earned: StreakTier | null = null;
  for (const tier of STREAK_TIERS) {
    if (streakBest >= tier.days) earned = tier;
  }
  return earned;
}

export interface StreakProgress {
  bestTier: StreakTier | null;
  /** First tier the best-ever streak hasn't reached yet, or null when every badge is earned. */
  nextTier: StreakTier | null;
  /** 0..1, how far the current streak is toward nextTier (1 when every badge is earned). */
  progress: number;
  daysLeft: number;
}

/**
 * The next badge is the first one the best-ever streak hasn't reached; the current streak has
 * to climb to its threshold to earn it. Shared by /profile and the home page status row.
 */
export function streakProgress(current: number, best: number): StreakProgress {
  const nextTier = STREAK_TIERS.find(t => t.days > best) ?? null;
  return {
    bestTier: highestEarnedTier(best),
    nextTier,
    progress: nextTier ? Math.min(current / nextTier.days, 1) : 1,
    daysLeft: nextTier ? Math.max(nextTier.days - current, 0) : 0,
  };
}
