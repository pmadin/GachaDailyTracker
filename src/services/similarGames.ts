// Near-duplicate detection for game submissions. Pure functions, no DB, so it can be unit
// tested. The catalog is a few hundred rows, so scoring every game in JS is cheaper and more
// predictable than adding a Postgres extension (pg_trgm) for it.

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function bigrams(s: string): Map<string, number> {
  const compact = s.replace(/ /g, '');
  const grams = new Map<string, number>();
  for (let i = 0; i < compact.length - 1; i++) {
    const g = compact.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  return grams;
}

/** Sørensen–Dice coefficient over character bigrams, 0..1. */
function dice(a: string, b: string): number {
  const ga = bigrams(a);
  const gb = bigrams(b);
  let sizeA = 0;
  let sizeB = 0;
  let overlap = 0;
  for (const n of ga.values()) sizeA += n;
  for (const n of gb.values()) sizeB += n;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  return sizeA + sizeB === 0 ? 0 : (2 * overlap) / (sizeA + sizeB);
}

/**
 * How alike two game names are, 0..1. One name containing the other ("Limbus Company" vs
 * "Limbus Company Global") counts as a strong match, since server/region words are the usual
 * difference between a submission and an existing row.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const contained = (` ${na} `).includes(` ${nb} `) || (` ${nb} `).includes(` ${na} `);
  return Math.max(dice(na, nb), contained ? 0.9 : 0);
}

export interface CatalogGame {
  id: number;
  name: string;
  server: string;
}

export function findSimilarGames<T extends CatalogGame>(
  name: string,
  catalog: T[],
  { threshold = 0.45, limit = 6 } = {},
): (T & { score: number })[] {
  return catalog
    .map(g => ({ ...g, score: Math.round(nameSimilarity(name, g.name) * 100) / 100 }))
    .filter(g => g.score >= threshold)
    .sort((x, y) => y.score - x.score || x.name.localeCompare(y.name))
    .slice(0, limit);
}
