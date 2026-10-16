'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import BadgeReveal from '../_components/BadgeReveal';
import { STREAK_TIERS, highestEarnedTier, type StreakTier } from '../_lib/badges';
import { fetchProfile } from '../_lib/api';
import { useAuth } from './AuthContext';

// { [userId]: days of the highest tier already revealed on this browser }. The server only
// sends tierUnlocked once, so this is a backstop for multi-tab, the verify path, and
// shared browsers with more than one account.
const STORAGE_KEY = 'gdt_badge_revealed';

function readRevealed(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function markRevealed(userId: number, days: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readRevealed(), [userId]: days }));
  } catch {
    // Storage blocked: the reveal may replay on another tab, which is harmless.
  }
}

const BadgeRevealContext = createContext<{ reveal: (tierKey: StreakTier['key'], streakDays: number) => void }>({
  reveal: () => {},
});

/**
 * Owns the one badge-unlock overlay. Pages call reveal() with the tierUnlocked key from
 * POST /tracker/streak; this provider also plays the reveal when an account becomes verified
 * during the session, since that's when badges earned while unverified unlock.
 */
export function BadgeRevealProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const [active, setActive] = useState<{ tier: StreakTier; streakDays: number } | null>(null);
  const userId = user?.id;

  const reveal = useCallback((tierKey: StreakTier['key'], streakDays: number) => {
    const tier = STREAK_TIERS.find(t => t.key === tierKey);
    if (!tier || userId === undefined) return;
    if ((readRevealed()[userId] ?? 0) >= tier.days) return;
    markRevealed(userId, tier.days);
    setActive({ tier, streakDays });
  }, [userId]);

  // Watch for email_verified going false -> true for the same account.
  const lastVerified = useRef<{ id: number; verified: boolean | undefined } | null>(null);
  const verified = user?.email_verified;
  useEffect(() => {
    const prev = lastVerified.current;
    lastVerified.current = userId === undefined ? null : { id: userId, verified };
    if (!token || !prev || prev.id !== userId || prev.verified !== false || verified !== true) return;
    fetchProfile(token)
      .then(({ user: fresh }) => {
        const tier = highestEarnedTier(fresh.streak_best);
        if (tier) reveal(tier.key, fresh.streak_best);
      })
      .catch(() => {});
  }, [token, userId, verified, reveal]);

  return (
    <BadgeRevealContext.Provider value={{ reveal }}>
      {children}
      {active && (
        <BadgeReveal tier={active.tier} streakDays={active.streakDays} onClose={() => setActive(null)} />
      )}
    </BadgeRevealContext.Provider>
  );
}

export function useBadgeReveal() {
  return useContext(BadgeRevealContext);
}
