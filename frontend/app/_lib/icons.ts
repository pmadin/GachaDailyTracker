const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Where a game's icon lives. Upstream icons are GIFs in the Game-Time-Master folder
 * (NEXT_PUBLIC_ICONS_BASE_URL). Admin-uploaded icons are stored in the DB and named
 * 'custom/<gameId>-<hash>', served by the API as WebP. No icon falls back to the gem placeholder.
 */
export function gameIconSrc(iconName: string | null | undefined): string {
  if (!iconName) return '/placeholder.svg';
  if (iconName.startsWith('custom/')) return `${API}/gdt/icons/${iconName}.webp`;
  return `${process.env.NEXT_PUBLIC_ICONS_BASE_URL}/${iconName}.gif`;
}
