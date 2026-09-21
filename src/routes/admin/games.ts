import express, { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import sizeOf from 'image-size';
import database from '../../config/database';
import { requireAdmin, requireOwner } from '../../middleware/admin';
import gameDataService from '../../services/gameDataService';
import { runUpstreamSync, SyncGuardError } from '../../services/gameSyncService';

const adminGamesRouter: Router = express.Router();

const ICONS_DIR =
  process.env.ICONS_DIR ?? path.join(process.cwd(), 'frontend', 'public', 'icons');

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

// ─── multer for icon upload ───────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 512 * 1024 }, // 500 KB hard cap
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/gif') return cb(null, true);
    cb(new Error('Only GIF files are accepted'));
  },
});

/**
 * @swagger
 * /gdt/admin/games:
 *   get:
 *     summary: List all games (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     description: Returns all games including soft-deleted ones. Requires admin role (3+).
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Filter by name or server (case-insensitive)
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 200
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of games with tracked_by count
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin role required
 */
// ─── GET /admin/games ─────────────────────────────────────────────────────────
// List all games including soft-deleted, with optional search / active filter
adminGamesRouter.get('/games', requireAdmin, async (req, res) => {
  try {
    const { search, active, limit = '200', offset = '0' } = req.query;
    const params: unknown[] = [];
    let idx = 1;
    let where = 'WHERE 1=1';

    if (search) {
      where += ` AND (g.name ILIKE $${idx} OR g.server ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    if (active !== undefined) {
      where += ` AND g.is_active = $${idx}`;
      params.push(active === 'true');
      idx++;
    }

    const countResult = await database.query(
      `SELECT COUNT(*) FROM games g ${where}`,
      params
    );

    const activeResult = await database.query(
      `SELECT COUNT(*) FROM games WHERE is_active = true`
    );

    params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));
    const result = await database.query(
      `SELECT g.*, COUNT(ug.id)::int AS tracked_by
       FROM games g
       LEFT JOIN user_games ug ON ug.game_id = g.id
       ${where}
       GROUP BY g.id
       ORDER BY g.name ASC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    const syncInfo = gameDataService.getLastSyncInfo();

    res.json({
      games: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      activeCount: parseInt(activeResult.rows[0].count, 10),
      last_synced_at: syncInfo.lastFetch?.toISOString() ?? null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Admin list games error:', msg);
    res.status(500).json({ error: 'Failed to list games' });
  }
});

/**
 * @swagger
 * /gdt/admin/games:
 *   post:
 *     summary: Add a game (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, server, timezone, daily_reset]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Genshin Impact"
 *               server:
 *                 type: string
 *                 example: "Global"
 *               timezone:
 *                 type: string
 *                 example: "America/Los_Angeles"
 *               daily_reset:
 *                 type: string
 *                 example: "04:00"
 *               icon_name:
 *                 type: string
 *                 example: "genshin-impact"
 *     responses:
 *       201:
 *         description: Game created
 *       400:
 *         description: Missing required fields or invalid daily_reset format
 *       403:
 *         description: Forbidden
 *       409:
 *         description: Game already exists for that name + server
 */
// ─── POST /admin/games ────────────────────────────────────────────────────────
adminGamesRouter.post('/games', requireAdmin, async (req, res) => {
  try {
    const { name, server, timezone, daily_reset, icon_name } = req.body;

    if (!name || !server || !timezone || !daily_reset) {
      return res.status(400).json({ error: 'name, server, timezone, and daily_reset are required' });
    }
    if (!TIME_RE.test(daily_reset)) {
      return res.status(400).json({ error: 'daily_reset must be in HH:MM format' });
    }

    const result = await database.query(
      `INSERT INTO games (name, server, timezone, daily_reset, icon_name, source)
       VALUES ($1, $2, $3, $4, $5, 'admin')
       ON CONFLICT (name, server) DO NOTHING
       RETURNING *`,
      [name.trim(), server.trim(), timezone, daily_reset, icon_name ?? null]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: `Game "${name}" already exists for server "${server}"` });
    }

    res.status(201).json({ game: result.rows[0] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Admin add game error:', msg);
    res.status(500).json({ error: 'Failed to add game' });
  }
});

/**
 * @swagger
 * /gdt/admin/games/{id}:
 *   patch:
 *     summary: Update game fields (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               server:
 *                 type: string
 *               timezone:
 *                 type: string
 *               daily_reset:
 *                 type: string
 *                 example: "04:00"
 *     responses:
 *       200:
 *         description: Game updated
 *       400:
 *         description: No fields provided or invalid daily_reset
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Game not found
 */
// ─── PATCH /admin/games/:id ───────────────────────────────────────────────────
adminGamesRouter.patch('/games/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, server, timezone, daily_reset } = req.body;

    if (!name && !server && !timezone && !daily_reset) {
      return res.status(400).json({ error: 'At least one field to update is required' });
    }
    if (daily_reset && !TIME_RE.test(daily_reset)) {
      return res.status(400).json({ error: 'daily_reset must be in HH:MM format' });
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (name)        { fields.push(`name = $${idx++}`);        values.push(name.trim()); }
    if (server)      { fields.push(`server = $${idx++}`);      values.push(server.trim()); }
    if (timezone)    { fields.push(`timezone = $${idx++}`);    values.push(timezone); }
    if (daily_reset) { fields.push(`daily_reset = $${idx++}`); values.push(daily_reset); }

    fields.push('last_verified = CURRENT_TIMESTAMP');
    values.push(id);

    const result = await database.query(
      `UPDATE games SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json({ game: result.rows[0] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Admin update game error:', msg);
    res.status(500).json({ error: 'Failed to update game' });
  }
});

/**
 * @swagger
 * /gdt/admin/games/{id}:
 *   delete:
 *     summary: Soft delete game (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     description: Sets is_active = false. Use /hard for permanent deletion (owner only).
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Game deactivated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Game not found or already inactive
 */
// ─── DELETE /admin/games/:id ──────────────────────────────────────────────────
// Soft delete only — admin+
adminGamesRouter.delete('/games/:id', requireAdmin, async (req, res) => {
  try {
    const result = await database.query(
      `UPDATE games SET is_active = false, last_verified = CURRENT_TIMESTAMP
       WHERE id = $1 AND is_active = true RETURNING id, name, server`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found or already inactive' });
    }

    res.json({ message: 'Game deactivated', game: result.rows[0] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Admin soft delete error:', msg);
    res.status(500).json({ error: 'Failed to deactivate game' });
  }
});

/**
 * @swagger
 * /gdt/admin/games/{id}/restore:
 *   post:
 *     summary: Restore soft-deleted game (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Game restored
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Game not found or already active
 */
// ─── POST /admin/games/:id/restore ───────────────────────────────────────────
adminGamesRouter.post('/games/:id/restore', requireAdmin, async (req, res) => {
  try {
    const result = await database.query(
      `UPDATE games SET is_active = true, last_verified = CURRENT_TIMESTAMP
       WHERE id = $1 AND is_active = false RETURNING id, name, server`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found or already active' });
    }

    res.json({ message: 'Game restored', game: result.rows[0] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Admin restore game error:', msg);
    res.status(500).json({ error: 'Failed to restore game' });
  }
});

/**
 * @swagger
 * /gdt/admin/games/{id}/hard:
 *   delete:
 *     summary: Permanently delete game (owner only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     description: Irreversible. Requires owner role (4).
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Game permanently deleted
 *       403:
 *         description: Forbidden — owner role required
 *       404:
 *         description: Game not found
 */
// ─── DELETE /admin/games/:id/hard ────────────────────────────────────────────
// Permanent deletion — owner only
adminGamesRouter.delete('/games/:id/hard', requireOwner, async (req, res) => {
  try {
    const result = await database.query(
      'DELETE FROM games WHERE id = $1 RETURNING id, name, server',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }

    console.log(`💀 Game hard deleted by ${req.user!.username}:`, result.rows[0]);
    res.json({ message: 'Game permanently deleted', game: result.rows[0] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Admin hard delete error:', msg);
    res.status(500).json({ error: 'Failed to delete game' });
  }
});

/**
 * @swagger
 * /gdt/admin/import/games:
 *   post:
 *     summary: Import games from Game-Time-Master (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Always fetches live from the upstream GitHub repo. No request body needed.
 *       Never deletes games. Upstream renames listed in data/game-renames.json are applied in place
 *       (same game id, so tracking/streaks are preserved). A game that any user tracks is never
 *       deactivated — it is reported in skipped_deactivations. Pass dryRun=true to see the full
 *       plan without writing anything.
 *     parameters:
 *       - in: query
 *         name: dryRun
 *         schema:
 *           type: boolean
 *         description: Preview only — compute and return the plan, write nothing.
 *     responses:
 *       200:
 *         description: Import (or preview) complete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 dry_run:
 *                   type: boolean
 *                 total:
 *                   type: integer
 *                 added:
 *                   type: integer
 *                 updated:
 *                   type: integer
 *                 reactivated:
 *                   type: integer
 *                 renamed:
 *                   type: integer
 *                 deactivated:
 *                   type: integer
 *                 unchanged:
 *                   type: integer
 *                 skipped_deactivations:
 *                   type: array
 *                   description: Games missing upstream but still tracked by users, left active.
 *                   items:
 *                     type: object
 *                 rename_conflicts:
 *                   type: array
 *                   items:
 *                     type: object
 *                 invalid_entries:
 *                   type: array
 *                   items:
 *                     type: string
 *                 details:
 *                   type: object
 *                 source:
 *                   type: string
 *                 last_synced_at:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *       403:
 *         description: Forbidden
 *       422:
 *         description: Upstream data looks truncated or invalid — nothing was changed
 */
// Sync logic (dry run, rename map, tracked-game protection) lives in services/gameSyncService.ts.
adminGamesRouter.post('/import/games', requireAdmin, async (req, res) => {
  try {
    const dryRun = req.query.dryRun === 'true' || req.body?.dryRun === true;
    const report = await runUpstreamSync({ dryRun });
    res.json(report);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    if (error instanceof SyncGuardError) {
      console.warn('Admin import games refused:', msg);
      return res.status(422).json({ error: msg });
    }
    console.error('Admin import games error:', msg);
    res.status(500).json({ error: 'Import failed', details: msg });
  }
});

/**
 * @swagger
 * /gdt/admin/import/icons/patch:
 *   post:
 *     summary: Audit games with missing icon_name (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     description: Returns active games that have no icon_name set in the DB. Icons are served from GitHub raw URLs.
 *     responses:
 *       200:
 *         description: Audit complete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 missing_icon_name_count:
 *                   type: integer
 *                 missing_games:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *       403:
 *         description: Forbidden
 */
adminGamesRouter.post('/import/icons/patch', requireAdmin, async (req, res) => {
  try {
    const result = await database.query(
      `SELECT id, name FROM games
       WHERE is_active = true AND (icon_name IS NULL OR icon_name = '')`
    );

    res.json({
      message: 'Icon audit complete',
      missing_icon_name_count: result.rows.length,
      missing_games: result.rows.map((g: { id: number; name: string }) => ({ id: g.id, name: g.name })),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Admin icon audit error:', msg);
    res.status(500).json({ error: 'Icon audit failed', details: msg });
  }
});

/**
 * @swagger
 * /gdt/admin/games/{id}/icon:
 *   post:
 *     summary: Upload game icon (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     description: Upload a custom icon GIF. Must be exactly 96×96 px and under 500 KB.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               icon:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Icon uploaded
 *       400:
 *         description: No file, wrong format, or wrong dimensions
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Game not found
 */
// ─── POST /admin/games/:id/icon ───────────────────────────────────────────────
// Manual icon upload — must be a GIF at exactly 96×96 px
adminGamesRouter.post(
  '/games/:id/icon',
  requireAdmin,
  upload.single('icon'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Validate magic bytes: GIF89a / GIF87a start with 47 49 46
      const magic = req.file.buffer.slice(0, 3).toString('ascii');
      if (magic !== 'GIF') {
        return res.status(400).json({ error: 'File must be a GIF' });
      }

      // Validate dimensions
      const dims = sizeOf(req.file.buffer);
      if (dims.width !== 96 || dims.height !== 96) {
        return res.status(400).json({
          error: `Icon must be 96×96 px (got ${dims.width}×${dims.height})`,
        });
      }

      // Fetch the game's current icon_name to determine the filename
      const gameResult = await database.query(
        'SELECT id, name, icon_name FROM games WHERE id = $1',
        [req.params.id]
      );

      if (gameResult.rows.length === 0) {
        return res.status(404).json({ error: 'Game not found' });
      }

      const game = gameResult.rows[0];

      // Use existing icon_name or derive one from the game name
      const iconName = game.icon_name ?? game.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      fs.mkdirSync(ICONS_DIR, { recursive: true });
      fs.writeFileSync(path.join(ICONS_DIR, `${iconName}.gif`), req.file.buffer);

      // Update icon_name in DB if it wasn't set
      if (!game.icon_name) {
        await database.query(
          'UPDATE games SET icon_name = $1 WHERE id = $2',
          [iconName, game.id]
        );
      }

      res.json({ message: 'Icon uploaded', icon_name: iconName });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Admin icon upload error:', msg);
      res.status(500).json({ error: 'Icon upload failed', details: msg });
    }
  }
);

export { adminGamesRouter };
