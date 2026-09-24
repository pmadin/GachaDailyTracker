/**
 * Unit tests for the streak-badge tier lookup (src/constants/streakTiers.ts). Pure logic — no
 * database. Run with: npm run test:streak
 */
import { STREAK_TIERS, highestEarnedTier } from '../../src/constants/streakTiers';

let failures = 0;
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

// Sanity: the 6 tiers are exactly what the design calls for, in ascending order.
check(
  'STREAK_TIERS is Iron/Bronze/Silver/Gold/Platinum/Diamond at 7/14/30/90/180/365',
  JSON.stringify(STREAK_TIERS.map(t => [t.key, t.days])) ===
    JSON.stringify([['iron', 7], ['bronze', 14], ['silver', 30], ['gold', 90], ['platinum', 180], ['diamond', 365]])
);

check('0 days -> no tier', highestEarnedTier(0) === null);
check('6 days -> no tier (one below Iron)', highestEarnedTier(6) === null);
check('7 days -> Iron (exact boundary)', highestEarnedTier(7)?.key === 'iron');
check('13 days -> still Iron (one below Bronze)', highestEarnedTier(13)?.key === 'iron');
check('14 days -> Bronze (exact boundary)', highestEarnedTier(14)?.key === 'bronze');
check('29 days -> still Bronze', highestEarnedTier(29)?.key === 'bronze');
check('30 days -> Silver (exact boundary)', highestEarnedTier(30)?.key === 'silver');
check('89 days -> still Silver', highestEarnedTier(89)?.key === 'silver');
check('90 days -> Gold (exact boundary)', highestEarnedTier(90)?.key === 'gold');
check('179 days -> still Gold', highestEarnedTier(179)?.key === 'gold');
check('180 days -> Platinum (exact boundary)', highestEarnedTier(180)?.key === 'platinum');
check('364 days -> still Platinum', highestEarnedTier(364)?.key === 'platinum');
check('365 days -> Diamond (exact boundary)', highestEarnedTier(365)?.key === 'diamond');
check('a large streak_best (e.g. 1000) still resolves to the highest tier, Diamond', highestEarnedTier(1000)?.key === 'diamond');

if (failures > 0) {
  console.error(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('\nALL STREAK TIER CHECKS PASSED');
