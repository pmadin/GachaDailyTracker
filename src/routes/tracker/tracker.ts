import express, { Router } from 'express';
import database from '../../config/database';
import { authenticateToken } from '../../middleware/auth';

const trackerRouter: Router = express.Router();

trackerRouter.use(authenticateToken);

/**
 * @swagger
 * /gdt/tracker/games:
 *   get:
 *     summary: Get user's tracked games
 *     tags: [Tracker]
 *     security:
 *       - bearerAuth: []
 *     description: Returns the authenticated user's personal game list with today's completion status and all fields needed for countdown timers.
 *     responses:
 *       200:
 *         description: List of tracked games
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 games:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       user_game_id:
 *                         type: integer
 *                       game_id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       server:
 *                         type: string
 *                       timezone:
 *                         type: string
 *                       daily_reset:
 *                         type: string
 *                       icon_name:
 *                         type: string
 *                       completed_today:
 *                         type: boolean
 *                       added_at:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *       401:
 *         description: Authentication required
 */
trackerRouter.get('/games', async (req, res) => {
    try {
        const { userId } = req.user!;

        const result = await database.query(`
            SELECT
                ug.id                     AS user_game_id,
                ug.created_at             AS added_at,
                ug.display_order,
                ug.custom_reminder_offset,
                g.id              AS game_id,
                g.name,
                g.server,
                g.timezone,
                g.daily_reset,
                g.icon_name,
                CASE WHEN dc.id IS NOT NULL THEN true ELSE false END AS completed_today
            FROM user_games ug
            JOIN games g ON g.id = ug.game_id AND g.is_active = true
            LEFT JOIN daily_completions dc
                ON dc.user_id = ug.user_id
                AND dc.game_id = ug.game_id
                AND dc.completion_date = (
                    CASE
                        WHEN (CURRENT_TIMESTAMP AT TIME ZONE g.timezone)::time >= g.daily_reset
                        THEN (CURRENT_TIMESTAMP AT TIME ZONE g.timezone)::date
                        ELSE (CURRENT_TIMESTAMP AT TIME ZONE g.timezone)::date - 1
                    END
                )
            WHERE ug.user_id = $1
            ORDER BY ug.display_order ASC, g.name ASC
        `, [userId]);

        // Expire stale streak on read — catches users who return after missing days
        // without waiting for the nightly audit cron. Does NOT touch streak_best — that's
        // the permanent best-ever value powering streak achievement badges on /profile, and
        // must never decrease, only ratchet up (see POST /tracker/streak).
        await database.query(
            `UPDATE users
             SET streak_count = 0, streak_last_date = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
               AND streak_count > 0
               AND streak_last_date < CURRENT_DATE - 1`,
            [userId]
        );

        const streakResult = await database.query(
            'SELECT streak_count FROM users WHERE id = $1',
            [userId]
        );

        res.json({
            games: result.rows,
            total: result.rows.length,
            streak: streakResult.rows[0]?.streak_count ?? 0,
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error fetching tracked games:', errorMessage);
        res.status(500).json({ error: 'Failed to fetch tracked games' });
    }
});

/**
 * @swagger
 * /gdt/tracker/games/bulk:
 *   post:
 *     summary: Bulk add games to user's list
 *     tags: [Tracker]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Add multiple games at once. Used when an anonymous user signs up and wants to sync
 *       their locally-saved game selections to the database. Skips games already tracked
 *       and invalid/inactive game IDs without failing the whole request.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [gameIds]
 *             properties:
 *               gameIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 maxItems: 500
 *                 example: [1, 4, 17, 42]
 *     responses:
 *       200:
 *         description: Bulk import result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 added:
 *                   type: integer
 *                 already_tracked:
 *                   type: integer
 *                 invalid_ids:
 *                   type: array
 *                   items:
 *                     type: integer
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Authentication required
 */
trackerRouter.post('/games/bulk', async (req, res) => {
    try {
        const { userId } = req.user!;
        const { gameIds } = req.body;

        if (!Array.isArray(gameIds) || gameIds.length === 0) {
            return res.status(400).json({ error: 'gameIds must be a non-empty array' });
        }

        if (gameIds.length > 500) {
            return res.status(400).json({ error: 'Cannot bulk-add more than 500 games at once' });
        }

        // Validate all values are positive integers
        const validIds = gameIds.filter(id => Number.isInteger(id) && id > 0);
        const invalidIds = gameIds.filter(id => !Number.isInteger(id) || id <= 0);

        if (validIds.length === 0) {
            return res.status(400).json({ error: 'No valid game IDs provided' });
        }

        // Filter to only active games that actually exist
        const activeGamesResult = await database.query(
            `SELECT id FROM games WHERE id = ANY($1) AND is_active = true`,
            [validIds]
        );
        const activeIds = activeGamesResult.rows.map(r => r.id);
        const notFoundIds = validIds.filter(id => !activeIds.includes(id));
        const allInvalidIds = [...invalidIds, ...notFoundIds];

        if (activeIds.length === 0) {
            return res.status(200).json({ added: 0, already_tracked: 0, invalid_ids: allInvalidIds });
        }

        // Bulk insert, skip conflicts
        const placeholders = activeIds.map((_, i) => `($1, $${i + 2})`).join(', ');
        const values = [userId, ...activeIds];

        const insertResult = await database.query(
            `INSERT INTO user_games (user_id, game_id)
             VALUES ${placeholders}
             ON CONFLICT (user_id, game_id) DO NOTHING
             RETURNING game_id`,
            values
        );

        const insertedIds = insertResult.rows.map(r => r.game_id);
        const added = insertedIds.length;
        const alreadyTracked = activeIds.length - added;

        if (added > 0) {
            await database.query(
                `UPDATE games SET add_count = add_count + 1 WHERE id = ANY($1::int[])`,
                [insertedIds]
            );
        }

        res.json({
            added,
            already_tracked: alreadyTracked,
            invalid_ids: allInvalidIds
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error bulk adding games:', errorMessage);
        res.status(500).json({ error: 'Failed to bulk add games' });
    }
});

/**
 * @swagger
 * /gdt/tracker/games/{gameId}:
 *   post:
 *     summary: Add a game to user's list
 *     tags: [Tracker]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       201:
 *         description: Game added to tracking list
 *       404:
 *         description: Game not found or inactive
 *       409:
 *         description: Already tracking this game
 *       401:
 *         description: Authentication required
 */
trackerRouter.post('/games/:gameId', async (req, res) => {
    try {
        const { userId } = req.user!;
        const gameId = parseInt(req.params.gameId);

        if (isNaN(gameId)) {
            return res.status(400).json({ error: 'Invalid game ID' });
        }

        // Verify game exists and is active
        const gameCheck = await database.query(
            'SELECT id, name, server FROM games WHERE id = $1 AND is_active = true',
            [gameId]
        );

        if (gameCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Game not found or inactive' });
        }

        const result = await database.query(
            `INSERT INTO user_games (user_id, game_id)
             VALUES ($1, $2)
             ON CONFLICT (user_id, game_id) DO NOTHING
             RETURNING *`,
            [userId, gameId]
        );

        if (result.rows.length === 0) {
            return res.status(409).json({ error: 'Already tracking this game' });
        }

        await database.query(
            'UPDATE games SET add_count = add_count + 1 WHERE id = $1',
            [gameId]
        );

        const game = gameCheck.rows[0];
        res.status(201).json({
            message: 'Game added to your list',
            user_game: result.rows[0],
            game: { id: game.id, name: game.name, server: game.server }
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error adding game to tracker:', errorMessage);
        res.status(500).json({ error: 'Failed to add game' });
    }
});

/**
 * @swagger
 * /gdt/tracker/games/{gameId}:
 *   delete:
 *     summary: Remove a game from user's list
 *     tags: [Tracker]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Game removed from tracking list
 *       404:
 *         description: Not tracking this game
 *       401:
 *         description: Authentication required
 */
trackerRouter.delete('/games/:gameId', async (req, res) => {
    try {
        const { userId } = req.user!;
        const gameId = parseInt(req.params.gameId);

        if (isNaN(gameId)) {
            return res.status(400).json({ error: 'Invalid game ID' });
        }

        const result = await database.query(
            'DELETE FROM user_games WHERE user_id = $1 AND game_id = $2 RETURNING *',
            [userId, gameId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Not tracking this game' });
        }

        res.json({ message: 'Game removed from your list' });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error removing game from tracker:', errorMessage);
        res.status(500).json({ error: 'Failed to remove game' });
    }
});

/**
 * @swagger
 * /gdt/tracker/games/{gameId}/complete:
 *   post:
 *     summary: Mark today's daily as complete
 *     tags: [Tracker]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Daily marked as complete (idempotent)
 *       404:
 *         description: Not tracking this game
 *       401:
 *         description: Authentication required
 */
trackerRouter.post('/games/:gameId/complete', async (req, res) => {
    try {
        const { userId } = req.user!;
        const gameId = parseInt(req.params.gameId);

        if (isNaN(gameId)) {
            return res.status(400).json({ error: 'Invalid game ID' });
        }

        // Verify user is tracking this game
        const trackCheck = await database.query(
            'SELECT id FROM user_games WHERE user_id = $1 AND game_id = $2',
            [userId, gameId]
        );

        if (trackCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Not tracking this game' });
        }

        await database.query(
            `INSERT INTO daily_completions (user_id, game_id, completion_date)
             VALUES (
                 $1,
                 $2,
                 (SELECT CASE
                     WHEN (CURRENT_TIMESTAMP AT TIME ZONE timezone)::time >= daily_reset
                     THEN (CURRENT_TIMESTAMP AT TIME ZONE timezone)::date
                     ELSE (CURRENT_TIMESTAMP AT TIME ZONE timezone)::date - 1
                  END
                  FROM games WHERE id = $2)
             )
             ON CONFLICT (user_id, game_id, completion_date) DO NOTHING`,
            [userId, gameId]
        );

        res.json({ message: 'Daily marked as complete', date: new Date().toISOString().split('T')[0] });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error marking daily complete:', errorMessage);
        res.status(500).json({ error: 'Failed to mark daily complete' });
    }
});

/**
 * @swagger
 * /gdt/tracker/games/{gameId}/complete:
 *   delete:
 *     summary: Unmark today's daily
 *     tags: [Tracker]
 *     security:
 *       - bearerAuth: []
 *     description: Removes today's completion record. Idempotent — safe to call even if not marked complete.
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Daily unmarked (idempotent)
 *       401:
 *         description: Authentication required
 */
trackerRouter.delete('/games/:gameId/complete', async (req, res) => {
    try {
        const { userId } = req.user!;
        const gameId = parseInt(req.params.gameId);

        if (isNaN(gameId)) {
            return res.status(400).json({ error: 'Invalid game ID' });
        }

        await database.query(
            `DELETE FROM daily_completions
             WHERE user_id = $1 AND game_id = $2
             AND completion_date = (
                 SELECT CASE
                     WHEN (CURRENT_TIMESTAMP AT TIME ZONE timezone)::time >= daily_reset
                     THEN (CURRENT_TIMESTAMP AT TIME ZONE timezone)::date
                     ELSE (CURRENT_TIMESTAMP AT TIME ZONE timezone)::date - 1
                 END
                 FROM games WHERE id = $2
             )`,
            [userId, gameId]
        );

        res.json({ message: 'Daily unmarked', date: new Date().toISOString().split('T')[0] });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error unmarking daily:', errorMessage);
        res.status(500).json({ error: 'Failed to unmark daily' });
    }
});

/**
 * @swagger
 * /gdt/tracker/order:
 *   put:
 *     summary: Save custom game order
 *     tags: [Tracker]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orders]
 *             properties:
 *               orders:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     game_id:
 *                       type: integer
 *                     order_index:
 *                       type: integer
 *     responses:
 *       200:
 *         description: Order saved
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Authentication required
 */
/**
 * @swagger
 * /gdt/tracker/streak:
 *   post:
 *     summary: Record daily completion streak
 *     tags: [Tracker]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Verifies that ALL of the user's tracked active games have daily_completions rows
 *       for their current game-local period before incrementing the streak.
 *       Rate limited to one check per 60 seconds per user.
 *       Idempotent — safe to call multiple times on the same day.
 *     responses:
 *       200:
 *         description: Streak result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 streak:
 *                   type: integer
 *                 allComplete:
 *                   type: boolean
 *                 completed:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: Authentication required
 *       429:
 *         description: Rate limit — try again in a moment
 */
trackerRouter.post('/streak', async (req, res) => {
    try {
        const { userId } = req.user!;

        // Fetch current streak state + rate limit timestamp in one query
        const userResult = await database.query(
            `SELECT streak_count,
                    streak_last_attempted_at,
                    (streak_last_date = CURRENT_DATE) AS already_counted_today
             FROM users WHERE id = $1`,
            [userId]
        );

        if (!userResult.rows[0]) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { streak_count: currentStreak, streak_last_attempted_at: lastAttempt, already_counted_today } = userResult.rows[0];

        // Rate limit: one check per 60 seconds
        if (lastAttempt) {
            const secondsSince = (Date.now() - new Date(lastAttempt).getTime()) / 1000;
            if (secondsSince < 60) {
                return res.status(429).json({
                    error: 'Too many streak checks. Try again in a moment.',
                    retryAfter: Math.ceil(60 - secondsSince),
                });
            }
        }

        await database.query(
            `UPDATE users SET streak_last_attempted_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [userId]
        );

        // Count active tracked games
        const trackedResult = await database.query(
            `SELECT COUNT(*) AS tracked_count
             FROM user_games ug
             JOIN games g ON g.id = ug.game_id AND g.is_active = true
             WHERE ug.user_id = $1`,
            [userId]
        );
        const trackedCount = parseInt(trackedResult.rows[0].tracked_count);

        if (trackedCount === 0) {
            return res.json({ streak: currentStreak, message: 'No games tracked' });
        }

        // Count completions for each game's current game-local period
        const completionResult = await database.query(
            `SELECT COUNT(*) AS completed_count
             FROM user_games ug
             JOIN games g ON g.id = ug.game_id
             WHERE ug.user_id = $1
               AND g.is_active = true
               AND EXISTS (
                 SELECT 1 FROM daily_completions dc
                 WHERE dc.user_id = ug.user_id
                   AND dc.game_id = ug.game_id
                   AND dc.completion_date = (
                     CASE
                       WHEN (CURRENT_TIMESTAMP AT TIME ZONE g.timezone)::time >= g.daily_reset
                       THEN (CURRENT_TIMESTAMP AT TIME ZONE g.timezone)::date
                       ELSE (CURRENT_TIMESTAMP AT TIME ZONE g.timezone)::date - 1
                     END
                   )
               )`,
            [userId]
        );
        const completedCount = parseInt(completionResult.rows[0].completed_count);

        if (completedCount < trackedCount) {
            return res.json({
                streak: currentStreak,
                allComplete: false,
                completed: completedCount,
                total: trackedCount,
                message: 'Not all games completed for today',
            });
        }

        // All games verified complete in DB — run streak increment logic.
        // streak_best ratchets up via GREATEST alongside streak_count in the same atomic
        // statement — it powers the permanent streak achievement badges on /profile, and must
        // never decrease (only the audit cron / GET /tracker/games self-heal reset
        // streak_count, and neither of those should ever touch streak_best — see their
        // comments). The streak_count CASE is repeated inline for the GREATEST computation
        // since a single UPDATE can't reference a sibling SET clause's new value.
        const result = await database.query(`
            UPDATE users
            SET
                streak_count = CASE
                    WHEN streak_last_date = CURRENT_DATE     THEN streak_count
                    WHEN streak_last_date = CURRENT_DATE - 1 THEN streak_count + 1
                    ELSE 1
                END,
                streak_last_date = CASE
                    WHEN streak_last_date = CURRENT_DATE THEN streak_last_date
                    ELSE CURRENT_DATE
                END,
                streak_best = GREATEST(
                    streak_best,
                    CASE
                        WHEN streak_last_date = CURRENT_DATE     THEN streak_count
                        WHEN streak_last_date = CURRENT_DATE - 1 THEN streak_count + 1
                        ELSE 1
                    END
                )
            WHERE id = $1
            RETURNING streak_count, streak_best
        `, [userId]);

        const newStreak = result.rows[0].streak_count;
        const newBest = result.rows[0].streak_best;

        res.json({
            streak: newStreak,
            streakBest: newBest,
            allComplete: true,
            completed: completedCount,
            total: trackedCount,
            message: already_counted_today ? 'Streak already counted for today' : 'Streak updated',
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error updating streak:', errorMessage);
        res.status(500).json({ error: 'Failed to update streak' });
    }
});

trackerRouter.put('/order', async (req, res) => {
    const client = await database.getClient();
    try {
        const { userId } = req.user!;
        const { orders } = req.body;

        if (!Array.isArray(orders) || orders.length === 0) {
            client.release();
            return res.status(400).json({ error: 'orders must be a non-empty array' });
        }

        await client.query('BEGIN');
        for (const { game_id, order_index } of orders) {
            if (!Number.isInteger(game_id) || game_id <= 0 || !Number.isInteger(order_index) || order_index < 0) {
                await client.query('ROLLBACK');
                client.release();
                return res.status(400).json({ error: 'Invalid game_id or order_index' });
            }
            await client.query(
                'UPDATE user_games SET display_order = $1 WHERE user_id = $2 AND game_id = $3',
                [order_index, userId, game_id]
            );
        }
        await client.query('COMMIT');

        res.json({ message: 'Order saved' });

    } catch (error: unknown) {
        await client.query('ROLLBACK').catch(() => {});
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error saving game order:', errorMessage);
        res.status(500).json({ error: 'Failed to save order' });
    } finally {
        client.release();
    }
});

trackerRouter.patch('/games/:id/reminder', async (req, res) => {
    try {
        const { userId } = req.user!;
        const gameId = parseInt(req.params.id, 10);
        if (isNaN(gameId)) return res.status(400).json({ error: 'Invalid game ID' });

        const raw = parseInt(req.body.offset, 10);
        if (isNaN(raw)) return res.status(400).json({ error: 'offset must be a number' });
        const offset = Math.max(0, Math.min(1440, raw));

        await database.query(
            'UPDATE user_games SET custom_reminder_offset = $1 WHERE user_id = $2 AND game_id = $3',
            [offset, userId, gameId]
        );

        res.json({ message: 'Reminder offset updated', offset });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error updating reminder offset:', errorMessage);
        res.status(500).json({ error: 'Failed to update reminder offset' });
    }
});

export { trackerRouter };
