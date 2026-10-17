/**
 * Server regions a user can pick when submitting a game. The value is what's stored in
 * `games.server` and matches what the catalog already uses, so the games-browser filters
 * (`SERVER_GROUPS` in frontend/app/_lib/servers.ts) keep working. Mirrored in that file as
 * `SUBMIT_SERVER_OPTIONS`; keep the two lists in sync.
 */
export const SUBMIT_SERVER_VALUES = [
    'Global', 'NA', 'South America', 'Americas', 'EU', 'Asia', 'Asia-Pacific', 'SEA',
    'JP', 'KR', 'CN', 'TW', 'Oceania',
] as const;

/** "Other" servers: a short name, plus notes explaining it (checked by the caller). */
export const OTHER_SERVER_RE = /^[A-Za-z0-9][A-Za-z0-9 &/()'-]{1,29}$/;

/**
 * Returns the canonical stored value for a listed region (case-insensitive), the trimmed
 * name for a valid "other" server, or null if it's neither.
 */
export function normalizeSubmitServer(raw: string, isOther: boolean): string | null {
    const s = raw.trim();
    const listed = SUBMIT_SERVER_VALUES.find(v => v.toLowerCase() === s.toLowerCase());
    if (listed) return listed;
    if (isOther && OTHER_SERVER_RE.test(s)) return s;
    return null;
}
