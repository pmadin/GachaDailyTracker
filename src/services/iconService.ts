import crypto from 'crypto';
import sharp from 'sharp';

// Custom game icons (admin uploads) live in the game_icons table, not on disk: the Heroku dyno
// filesystem is wiped on every restart. A game with a custom icon gets
// icon_name = 'custom/<gameId>-<hash>', which the frontend's gameIconSrc() maps to
// GET /gdt/icons/custom/<gameId>-<hash>.webp instead of the upstream Game-Time-Master folder.
// The hash changes with the image, so the response can be cached forever.

export const ICON_SIZE = 96;
export const ICON_MAX_INPUT_BYTES = 2 * 1024 * 1024;
export const CUSTOM_ICON_PREFIX = 'custom/';

// Formats accepted on input, as sharp detects them from the bytes (never the filename or the
// client's Content-Type). No SVG: it's a script-capable document, not an image.
const ALLOWED_FORMATS = new Set(['png', 'jpeg', 'webp', 'gif']);

export type IconFit = 'cover' | 'contain';

export class IconError extends Error {}

export interface ProcessedIcon {
  data: Buffer;
  mime: 'image/webp';
  hash: string;
  animated: boolean;
}

/**
 * Validate and re-encode an uploaded image as a 96×96 WebP. Re-encoding drops metadata and
 * anything appended to the file, so only decoded pixels make it into the DB.
 * `cover` center-crops to fill the square; `contain` keeps the whole image and pads it with
 * the site's warm near-black. Animated GIF/WebP stay animated.
 */
export async function processIcon(input: Buffer, fit: IconFit = 'cover'): Promise<ProcessedIcon> {
  if (input.length === 0) throw new IconError('The file is empty');
  if (input.length > ICON_MAX_INPUT_BYTES) throw new IconError('Icon must be 2 MB or smaller');

  let meta: sharp.Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new IconError('That file is not a readable image');
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new IconError('Icon must be a PNG, JPEG, WebP or GIF');
  }
  if (!meta.width || !meta.height || meta.width > 4096 || meta.height > 4096) {
    throw new IconError('Icon must be at most 4096×4096 px');
  }

  const animated = (meta.pages ?? 1) > 1;
  const data = await sharp(input, { animated, limitInputPixels: 4096 * 4096 * (meta.pages ?? 1) })
    .rotate() // apply EXIF orientation before it's stripped
    .resize(ICON_SIZE, ICON_SIZE, {
      fit,
      position: 'centre',
      background: { r: 13, g: 11, b: 8, alpha: 1 },
    })
    .webp({ quality: 90, effort: 4 })
    .toBuffer();

  const hash = crypto.createHash('sha256').update(data).digest('hex').slice(0, 10);
  return { data, mime: 'image/webp', hash, animated };
}

interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

/**
 * Store a processed icon for a game and point games.icon_name at it. Takes either the pool or a
 * transaction client, so the submission approve flow can do it inside its transaction.
 */
export async function saveGameIcon(db: Queryable, gameId: number, icon: ProcessedIcon, adminId: number): Promise<string> {
  const iconName = customIconName(gameId, icon.hash);
  await db.query(
    `INSERT INTO game_icons (game_id, data, mime, hash, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     ON CONFLICT (game_id) DO UPDATE SET
       data = EXCLUDED.data, mime = EXCLUDED.mime, hash = EXCLUDED.hash,
       updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`,
    [gameId, icon.data, icon.mime, icon.hash, adminId]
  );
  await db.query('UPDATE games SET icon_name = $1 WHERE id = $2', [iconName, gameId]);
  return iconName;
}

export function customIconName(gameId: number, hash: string): string {
  return `${CUSTOM_ICON_PREFIX}${gameId}-${hash}`;
}

export function isCustomIconName(iconName: string | null | undefined): boolean {
  return typeof iconName === 'string' && iconName.startsWith(CUSTOM_ICON_PREFIX);
}

export function parseIconFit(value: unknown): IconFit {
  return value === 'contain' ? 'contain' : 'cover';
}
