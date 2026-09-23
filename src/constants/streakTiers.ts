// Mirrors the canonical tier list in frontend/app/_lib/badges.ts (STREAK_TIERS) — keep the
// keys/labels/day thresholds in sync if either changes. Same cross-side duplication pattern
// already used for region grouping between admin/analytics.ts and _lib/servers.ts, since
// src/ and frontend/ don't share a package in this monorepo.
export const STREAK_TIERS = [
  { key: 'iron',     label: 'Iron',     days: 7   },
  { key: 'bronze',   label: 'Bronze',   days: 14  },
  { key: 'silver',   label: 'Silver',   days: 30  },
  { key: 'gold',     label: 'Gold',     days: 90  },
  { key: 'platinum', label: 'Platinum', days: 180 },
  { key: 'diamond',  label: 'Diamond',  days: 365 },
] as const;

export type StreakTierKey = (typeof STREAK_TIERS)[number]['key'];

/** Highest tier a given best-ever streak has earned, or null if under the first threshold. */
export function highestEarnedTier(streakBest: number): (typeof STREAK_TIERS)[number] | null {
  let earned: (typeof STREAK_TIERS)[number] | null = null;
  for (const tier of STREAK_TIERS) {
    if (streakBest >= tier.days) earned = tier;
  }
  return earned;
}
