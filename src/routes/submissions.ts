import express, { Request, Response, Router } from 'express';
import database from '../config/database';
import { requireAdmin, getRoleName } from '../middleware/admin';
import TimezoneService from '../services/timezoneService';
import { iconUpload } from '../middleware/iconUpload';
import { IconError, parseIconFit, processIcon, saveGameIcon, type ProcessedIcon } from '../services/iconService';
import { findSimilarGames } from '../services/similarGames';

const submissionsRouter: Router = express.Router();
const adminSubmissionsRouter: Router = express.Router();

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

interface GameFields { name: string; server: string; timezone: string; daily_reset: string }

/** Shared by user submissions and the admin approve step. */
function validateGameFields(input: Record<string, unknown>): GameFields | { error: string } {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const server = typeof input.server === 'string' ? input.server.trim() : '';
    const timezone = typeof input.timezone === 'string' ? input.timezone : '';
    const daily_reset = typeof input.daily_reset === 'string' ? input.daily_reset : '';

    if (!name || name.length > 255) return { error: 'Game name is required (1–255 characters)' };
    if (!server || server.length > 100) return { error: 'Server is required (1–100 characters)' };
    if (!timezone || !TimezoneService.isValidTimezone(timezone)) return { error: 'Valid timezone is required' };
    if (!daily_reset || !TIME_RE.test(daily_reset)) return { error: 'Daily reset must be in HH:MM format' };
    return { name, server, timezone, daily_reset };
}

/** Case-insensitive name + server match, the same rule users hit when submitting. */
async function findExistingGame(name: string, server: string) {
    const result = await database.query(
        `SELECT id, name, server, is_active FROM games
         WHERE LOWER(name) = LOWER($1) AND LOWER(server) = LOWER($2)
         LIMIT 1`,
        [name, server]
    );
    return result.rows[0] as { id: number; name: string; server: string; is_active: boolean } | undefined;
}

/**
 * @swagger
 * /gdt/submissions:
 *   post:
 *     summary: Submit a game for admin review
 *     tags: [Submissions]
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
 *                 maxLength: 255
 *               server:
 *                 type: string
 *                 maxLength: 100
 *               timezone:
 *                 type: string
 *               daily_reset:
 *                 type: string
 *                 example: "04:00"
 *               notes:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       201:
 *         description: Submission received
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate game or pending submission already exists
 */
submissionsRouter.post('/', async (req: Request, res: Response) => {
    try {
        const { notes } = req.body;
        const userId = req.user!.userId;

        const fields = validateGameFields(req.body);
        if ('error' in fields) return res.status(400).json({ error: fields.error });
        const { name: cleanName, server: cleanServer, timezone, daily_reset } = fields;

        if (notes && typeof notes === 'string' && notes.length > 500) {
            return res.status(400).json({ error: 'Notes must be 500 characters or fewer' });
        }

        if (await findExistingGame(cleanName, cleanServer)) {
            return res.status(409).json({ error: 'This game already exists in the database' });
        }

        // Duplicate pending submission check
        const pendingSub = await database.query(
            `SELECT id FROM game_submissions
             WHERE LOWER(name) = LOWER($1) AND LOWER(server) = LOWER($2) AND status = 'pending'`,
            [cleanName, cleanServer]
        );
        if (pendingSub.rows.length > 0) {
            return res.status(409).json({ error: 'A submission for this game is already pending review' });
        }

        // authenticateToken hardcodes role=1; fetch actual role from DB
        const userResult = await database.query('SELECT role FROM users WHERE id = $1', [userId]);
        const submitterRole = userResult.rows[0]?.role ?? 1;

        const result = await database.query(
            `INSERT INTO game_submissions
               (submitted_by, submitter_role, name, server, timezone, daily_reset, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, name, server, status`,
            [userId, submitterRole, cleanName, cleanServer, timezone, daily_reset,
             typeof notes === 'string' ? notes.trim() || null : null]
        );

        console.log(`📬 Game submitted by user ${userId}: "${cleanName}" (${cleanServer})`);

        res.status(201).json({
            message: 'Submission received. An admin will review it shortly.',
            submission: result.rows[0],
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('Submission error:', msg);
        res.status(500).json({ error: 'Failed to submit game' });
    }
});

/**
 * @swagger
 * /gdt/admin/submissions:
 *   get:
 *     summary: List game submissions (Admin Only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, all]
 *           default: pending
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Paginated list of submissions
 */
adminSubmissionsRouter.get('/submissions', requireAdmin, async (req: Request, res: Response) => {
    try {
        const { status = 'pending', limit = '20', offset = '0' } = req.query;
        const validStatuses = ['pending', 'approved', 'rejected', 'all'];
        const statusFilter = validStatuses.includes(status as string)
            ? (status as string)
            : 'pending';

        const params: unknown[] = [];
        let where = '';
        if (statusFilter !== 'all') {
            where = 'WHERE gs.status = $1';
            params.push(statusFilter);
        }

        const [countResult, result] = await Promise.all([
            database.query(
                `SELECT COUNT(*) FROM game_submissions gs ${where}`,
                params
            ),
            database.query(
                `SELECT
                   gs.id, gs.name, gs.server, gs.timezone, gs.daily_reset,
                   gs.notes, gs.status, gs.submitter_role,
                   gs.review_notes, gs.reviewed_at, gs.created_at,
                   u_reviewer.role AS reviewed_by_role
                 FROM game_submissions gs
                 LEFT JOIN users u_reviewer ON gs.reviewed_by = u_reviewer.id
                 ${where}
                 ORDER BY gs.created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, parseInt(limit as string), parseInt(offset as string)]
            ),
        ]);

        const submissions = result.rows.map(row => ({
            ...row,
            submitter_role_name: getRoleName(row.submitter_role),
            reviewed_by_role_name: row.reviewed_by_role != null
                ? getRoleName(row.reviewed_by_role)
                : null,
        }));

        res.json({
            submissions,
            total: parseInt(countResult.rows[0].count),
            status_filter: statusFilter,
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('Submissions list error:', msg);
        res.status(500).json({ error: 'Failed to fetch submissions' });
    }
});

/**
 * @swagger
 * /gdt/admin/submissions/{id}/similar:
 *   get:
 *     summary: Existing games with a similar name (Admin Only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Near-duplicate check for the review panel. Scores every game name against `name`
 *       (defaults to the submitted name) and returns the closest few, active or not.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Name to compare instead of the submitted one (the admin's edited name)
 *     responses:
 *       200:
 *         description: Similar games, best match first
 *       404:
 *         description: Submission not found
 */
adminSubmissionsRouter.get('/submissions/:id/similar', requireAdmin, async (req: Request, res: Response) => {
    try {
        const sub = await database.query('SELECT name FROM game_submissions WHERE id = $1', [parseInt(req.params.id)]);
        if (sub.rows.length === 0) return res.status(404).json({ error: 'Submission not found' });

        const name = typeof req.query.name === 'string' && req.query.name.trim()
            ? req.query.name.trim()
            : sub.rows[0].name;
        const catalog = await database.query(
            `SELECT id, name, server, timezone, daily_reset, icon_name, is_active, source FROM games`
        );
        res.json({ games: findSimilarGames(name, catalog.rows) });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('Similar games error:', msg);
        res.status(500).json({ error: 'Failed to look up similar games' });
    }
});

/**
 * @swagger
 * /gdt/admin/submissions/{id}:
 *   patch:
 *     summary: Approve or reject a game submission (Admin Only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Approve creates the game from the (optionally edited) fields, in one transaction with
 *       the optional icon and the submission update. A game with the same name and server
 *       (case-insensitive) is a 409 that names the existing game, never a silent no-op.
 *       Send multipart/form-data to include an icon; JSON works for everything else.
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
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [approve, reject]
 *               review_notes:
 *                 type: string
 *               name:
 *                 type: string
 *                 description: Edited name (approve only; defaults to the submitted value)
 *               server:
 *                 type: string
 *               timezone:
 *                 type: string
 *               daily_reset:
 *                 type: string
 *                 example: "04:00"
 *               activate:
 *                 type: boolean
 *                 description: Make the game visible right away (default false)
 *               fit:
 *                 type: string
 *                 enum: [cover, contain]
 *               icon:
 *                 type: string
 *                 format: binary
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *     responses:
 *       200:
 *         description: Submission reviewed successfully
 *       400:
 *         description: Invalid action/fields/icon, or submission already reviewed
 *       404:
 *         description: Submission not found
 *       409:
 *         description: A game with this name and server already exists
 */
adminSubmissionsRouter.patch('/submissions/:id', requireAdmin, iconUpload, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const { action, review_notes } = req.body;
    const adminId = req.user!.userId;
    const notes = typeof review_notes === 'string' ? review_notes.trim() || null : null;

    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Action must be "approve" or "reject"' });
    }

    try {
        const subResult = await database.query('SELECT * FROM game_submissions WHERE id = $1', [id]);
        if (subResult.rows.length === 0) {
            return res.status(404).json({ error: 'Submission not found' });
        }
        const sub = subResult.rows[0];
        if (sub.status !== 'pending') {
            return res.status(400).json({ error: `Submission is already ${sub.status}` });
        }

        if (action === 'reject') {
            await database.query(
                `UPDATE game_submissions
                 SET status = 'rejected', reviewed_by = $1, review_notes = $2, reviewed_at = CURRENT_TIMESTAMP
                 WHERE id = $3`,
                [adminId, notes, id]
            );
            console.log(`❌ Submission #${id} rejected by admin ${adminId}: "${sub.name}" (${sub.server})`);
            return res.json({ message: 'Submission rejected.' });
        }

        // Approve: the admin's edits win, the submitted values fill anything left out.
        const fields = validateGameFields({
            name: req.body.name ?? sub.name,
            server: req.body.server ?? sub.server,
            timezone: req.body.timezone ?? sub.timezone,
            daily_reset: req.body.daily_reset ?? String(sub.daily_reset).slice(0, 5),
        });
        if ('error' in fields) return res.status(400).json({ error: fields.error });

        const activate = req.body.activate === true || req.body.activate === 'true';

        // Process the icon before touching the DB, so a bad file fails without side effects.
        let icon: ProcessedIcon | null = null;
        if (req.file) {
            try {
                icon = await processIcon(req.file.buffer, parseIconFit(req.body.fit));
            } catch (err) {
                if (err instanceof IconError) return res.status(400).json({ error: err.message });
                throw err;
            }
        }

        const dupe = await findExistingGame(fields.name, fields.server);
        if (dupe) {
            return res.status(409).json({
                error: `"${dupe.name}" (${dupe.server}) already exists${dupe.is_active ? '' : ' (inactive)'}. Edit the name or server, or reject this as a duplicate.`,
                existing_game: dupe,
            });
        }

        const client = await database.getClient();
        try {
            await client.query('BEGIN');
            const gameResult = await client.query(
                `INSERT INTO games (name, server, timezone, daily_reset, is_active, source)
                 VALUES ($1, $2, $3, $4, $5, 'user-submission')
                 RETURNING id`,
                [fields.name, fields.server, fields.timezone, fields.daily_reset, activate]
            );
            const gameId: number = gameResult.rows[0].id;
            if (icon) await saveGameIcon(client, gameId, icon, adminId);
            await client.query(
                `UPDATE game_submissions
                 SET status = 'approved', reviewed_by = $1, review_notes = $2, reviewed_at = CURRENT_TIMESTAMP, game_id = $3
                 WHERE id = $4`,
                [adminId, notes, gameId, id]
            );
            await client.query('COMMIT');

            console.log(`✅ Submission #${id} approved by admin ${adminId} as game ${gameId}: "${fields.name}" (${fields.server})${activate ? ', active' : ''}`);
            return res.json({
                message: activate
                    ? `Approved. "${fields.name}" is live now.`
                    : `Approved. "${fields.name}" was added as inactive; activate it in the Games panel when ready.`,
                game_id: gameId,
            });
        } catch (err: unknown) {
            await client.query('ROLLBACK');
            // Lost a race with another insert of the same name/server.
            if ((err as { code?: string }).code === '23505') {
                return res.status(409).json({ error: 'A game with this name and server already exists' });
            }
            throw err;
        } finally {
            client.release();
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('Submission review error:', msg);
        res.status(500).json({ error: 'Failed to review submission' });
    }
});

export { submissionsRouter, adminSubmissionsRouter };
