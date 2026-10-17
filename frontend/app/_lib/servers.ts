// Maps canonical dropdown group → raw server values stored in the DB
export const SERVER_GROUPS: Record<string, string[]> = {
  'Global':         ['Global'],
  'North America':  ['EN', 'America', 'Americas', 'NA', 'North America', 'US', 'America (East)', 'Americas / Europe', 'Americas & Oceania'],
  'Japan':          ['JP'],
  'Korea':          ['KR', 'Korea'],
  'China':          ['CN'],
  'Taiwan':         ['TW'],
  'Asia':           ['Asia', 'East Asia', 'SEA', 'Asia-Pacific'],
  'Europe':         ['EU', 'Europe'],
  'South America':  ['South America'],
  'Oceania':        ['Oceania'],
};

const SERVER_DISPLAY: Record<string, string> = {
  'JP': 'Japan',
  'KR': 'Korea',
  'Korea': 'Korea',
  'CN': 'China',
  'TW': 'Taiwan',
  'EU': 'Europe',
  'Europe': 'Europe',
  'NA': 'Americas',
  'America': 'Americas',
  'Americas': 'Americas',
  'North America': 'Americas',
  'US': 'Americas',
  'America (East)': 'E. Americas',
  'Americas / Europe': 'EU/Americas',
  'Americas & Oceania': 'Americas',
  'SEA': 'SE Asia',
  'East Asia': 'E. Asia',
  'South America': 'S. America',
  'EN': 'N. America',
  'Global': 'Global',
  'Asia': 'Asia',
  'Asia-Pacific': 'Asia-Pacific',
  'Oceania': 'Oceania',
};

/**
 * Server choices on the submit form. `value` is what's stored (matches the catalog, so the
 * filters above keep working); `label` says exactly what each one means. Mirrors
 * SUBMIT_SERVER_VALUES in src/constants/serverRegions.ts, which the API enforces.
 */
export const SUBMIT_SERVER_OPTIONS: { value: string; label: string }[] = [
  { value: 'Global',        label: 'Global (one server for everyone)' },
  { value: 'NA',            label: 'North America (US / Canada)' },
  { value: 'South America', label: 'South America / LATAM' },
  { value: 'Americas',      label: 'Americas (North + South share one server)' },
  { value: 'EU',            label: 'Europe' },
  { value: 'Asia',          label: 'Asia (one server for all of Asia)' },
  { value: 'Asia-Pacific',  label: 'Asia-Pacific' },
  { value: 'SEA',           label: 'Southeast Asia' },
  { value: 'JP',            label: 'Japan' },
  { value: 'KR',            label: 'Korea' },
  { value: 'CN',            label: 'China (mainland)' },
  { value: 'TW',            label: 'Taiwan / Hong Kong / Macau' },
  { value: 'Oceania',       label: 'Oceania' },
];

/** Same rule as OTHER_SERVER_RE on the API. */
export const OTHER_SERVER_RE = /^[A-Za-z0-9][A-Za-z0-9 &/()'-]{1,29}$/;

export function displayServer(raw: string): string {
  return SERVER_DISPLAY[raw] ?? raw;
}

export function groupToRawServers(group: string): string[] {
  return SERVER_GROUPS[group] ?? [];
}
