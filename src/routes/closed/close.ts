import express, { Router } from 'express';
import database from '../../config/database';
import { requireAdmin } from '../../middleware/admin';
import TimezoneService from '../../services/timezoneService';

const updateRouter: Router = express.Router();

// Editing, adding and deleting games is admin-only (role 3+, verified email). This used to
// be authenticateToken alone, which let any logged-in user change the catalog.
updateRouter.use(requireAdmin);

/**
 * @swagger
 * /gdt/update/games/{id}:
 *   patch:
 *     summary: Update game information
 *     tags: [Game Management]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Update game information like reset times, timezone, etc.
 *       Requires authentication. Useful when game publishers change reset times
 *       (like when Azur Lane EN changed from 23:00 to 00:00).
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Game ID to update
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               daily_reset:
 *                 type: string
 *                 pattern: "^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
 *                 description: New daily reset time (HH:MM format)
 *                 example: "01:00"
 *               timezone:
 *                 type: string
 *                 description: New timezone
 *                 example: "America/Los_Angeles"
 *               reason:
 *                 type: string
 *                 description: Reason for the change (for audit purposes)
 *                 example: "Official game announcement - reset time changed"
 *           examples:
 *             azur_lane_change:
 *               summary: Azur Lane EN reset time change
 *               value:
 *                 daily_reset: "01:00"
 *                 reason: "Azur Lane EN changed daily reset from 00:00 to 01:00 PST"
 *             timezone_update:
 *               summary: Timezone correction
 *               value:
 *                 timezone: "America/New_York"
 *                 reason: "Corrected timezone for NA server"
 *     responses:
 *       200:
 *         description: Game updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Game updated successfully"
 *                 game:
 *                   $ref: '#/components/schemas/Game'
 *                 updated_by:
 *                   type: string
 *                   example: "username"
 *                 update_reason:
 *                   type: string
 *                   example: "Official game announcement"
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Game not found
 *       500:
 *         description: Server error
 */
updateRouter.patch('/games/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { daily_reset, timezone, is_active, reason } = req.body;
        const user = req.user!; // TypeScript knows user exists due to middleware

        console.log('🔍 Update request received:', {
            id,
            daily_reset,
            timezone,
            is_active,
            is_active_type: typeof is_active,
            reason
        });

        // Validate that at least one field is being updated
        if (!daily_reset && !timezone && is_active === undefined) {
            return res.status(400).json({
                error: 'At least one field (daily_reset, timezone, or is_active) must be provided'
            });
        }

        // Validate daily_reset format if provided
        if (daily_reset) {
            const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(daily_reset)) {
                return res.status(400).json({
                    error: 'daily_reset must be in HH:MM format (24-hour)'
                });
            }
        }

        // Check if game exists (INCLUDING soft-deleted games)
        const gameCheck = await database.query(
            'SELECT * FROM games WHERE id = $1',
            [id]
        );

        if (gameCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Game not found' });
        }

        const originalGame = gameCheck.rows[0];

        console.log('📋 Original game state:', {
            id: originalGame.id,
            name: originalGame.name,
            is_active: originalGame.is_active,
            is_active_type: typeof originalGame.is_active
        });

        // Build dynamic update query
        const updateFields: string[] = [];
        const updateValues: any[] = [];
        let paramIndex = 1;

        if (daily_reset) {
            updateFields.push(`daily_reset = $${paramIndex}`);
            updateValues.push(daily_reset);
            paramIndex++;
        }

        if (timezone) {
            const normalizedTimezone = TimezoneService.normalizeTimezone(timezone);

            updateFields.push(`timezone = $${paramIndex}`);
            updateValues.push(normalizedTimezone);
            paramIndex++;

            // Store for audit log later
            req.body._normalizedTimezone = normalizedTimezone;
        }

        // Handle is_active explicitly - check for both boolean and string values
        if (is_active !== undefined) {
            updateFields.push(`is_active = $${paramIndex}`);
            // Convert string "true"/"false" to boolean if needed
            let booleanValue = is_active;
            if (typeof is_active === 'string') {
                booleanValue = is_active.toLowerCase() === 'true';
            }
            updateValues.push(booleanValue);
            paramIndex++;
            console.log(`🔄 Adding is_active to update: ${booleanValue} (type: ${typeof booleanValue})`);
        }

        // Always update last_verified
        updateFields.push(`last_verified = CURRENT_TIMESTAMP`);

        // Add WHERE clause parameter
        updateValues.push(id);

        const updateQuery = `
            UPDATE games 
            SET ${updateFields.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `;

        console.log('🔧 SQL Query:', updateQuery);
        console.log('📊 SQL Parameters:', updateValues);

        const result = await database.query(updateQuery, updateValues);
        const updatedGame = result.rows[0];

        console.log('✅ Updated game result:', {
            id: updatedGame.id,
            is_active: updatedGame.is_active,
            is_active_type: typeof updatedGame.is_active
        });

        // Determine what type of operation this was
        let operationType = 'updated';
        if (is_active === true && !originalGame.is_active) {
            operationType = 'restored';
        } else if (is_active === false && originalGame.is_active) {
            operationType = 'soft deleted';
        }

        // Log the change for audit purposes
        console.log(`🔄 Game ${operationType} by ${user.username}:`, {
            gameId: id,
            gameName: originalGame.name,
            operation: operationType,
            changes: {
                daily_reset: daily_reset ? `${originalGame.daily_reset} → ${daily_reset}` : 'unchanged',
                timezone: timezone ? `${originalGame.timezone} → ${timezone}` : 'unchanged',
                is_active: is_active !== undefined ? `${originalGame.is_active} → ${is_active}` : 'unchanged'
            },
            reason: reason || 'No reason provided',
            updatedBy: user.username,
            timestamp: new Date().toISOString()
        });

        res.json({
            message: `Game ${operationType} successfully`,
            operation: operationType,
            game: updatedGame,
            updated_by: user.username,
            update_reason: reason || 'No reason provided',
            changes_made: {
                daily_reset: daily_reset ? `${originalGame.daily_reset} → ${daily_reset}` : null,
                timezone: timezone ? `${originalGame.timezone} → ${timezone}` : null,
                is_active: is_active !== undefined ? `${originalGame.is_active} → ${is_active}` : null
            }
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error updating game:', errorMessage);
        res.status(500).json({ error: 'Failed to update game' });
    }
});

/**
 * @swagger
 * /gdt/update/add/game:
 *   post:
 *     summary: Add new game
 *     tags: [Game Management]
 *     security:
 *       - bearerAuth: []
 *     description: Add a new gacha game to the database. Requires authentication.
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
 *                 example: "New Gacha Game"
 *               server:
 *                 type: string
 *                 example: "Global"
 *               timezone:
 *                 type: string
 *                 example: "Etc/GMT+8"
 *               daily_reset:
 *                 type: string
 *                 pattern: "^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
 *                 example: "04:00"
 *               icon_name:
 *                 type: string
 *                 example: "new-gacha-game"
 *     responses:
 *       201:
 *         description: Game added successfully
 *       400:
 *         description: Invalid input or game already exists
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Server error
 */
updateRouter.post('/add/game', async (req, res) => {
    try {
        const { name, server, timezone, daily_reset, icon_name } = req.body;
        const user = req.user!;

        // Validation
        if (!name || !server || !timezone || !daily_reset) {
            return res.status(400).json({
                error: 'name, server, timezone, and daily_reset are required'
            });
        }

        // Validate time format
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(daily_reset)) {
            return res.status(400).json({
                error: 'daily_reset must be in HH:MM format (24-hour)'
            });
        }

        // Check if game already exists
        const existingGame = await database.query(
            'SELECT id FROM games WHERE name = $1 AND server = $2',
            [name, server]
        );

        if (existingGame.rows.length > 0) {
            return res.status(400).json({
                error: `Game "${name}" already exists for server "${server}"`
            });
        }

        // Insert new game
        const result = await database.query(`
      INSERT INTO games (name, server, timezone, daily_reset, icon_name, source)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name, server, timezone, daily_reset, icon_name || null, 'user-contributed']);

        const newGame = result.rows[0];

        console.log(`✅ New game added by ${user.username}:`, {
            gameId: newGame.id,
            gameName: name,
            server,
            addedBy: user.username
        });

        res.status(201).json({
            message: 'Game added successfully',
            game: newGame,
            added_by: user.username
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error adding game:', errorMessage);
        res.status(500).json({ error: 'Failed to add game' });
    }
});

/**
 * @swagger
 * /gdt/update/delete/game/{id}:
 *   delete:
 *     summary: Delete a game by ID
 *     tags: [Game Management]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Delete a game from the database by its unique ID. This is safer than deleting by name
 *       since games like "Wuthering Waves" may have multiple server variants with different IDs.
 *       Use the search API (/gdt/games?search=game_name) to find the exact game ID first.
 *       This performs a soft delete by setting is_active = false.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Unique game ID to delete
 *         example:
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for deletion (for audit purposes)
 *                 example: "Game discontinued by publisher"
 *               permanent:
 *                 type: boolean
 *                 default: false
 *                 description: Whether to permanently delete (true) or soft delete (false)
 *           examples:
 *             soft_delete:
 *               summary: Soft delete (recommended)
 *               value:
 *                 reason: "Game discontinued by publisher"
 *                 permanent: false
 *             permanent_delete:
 *               summary: Permanent deletion
 *               value:
 *                 reason: "Duplicate entry - keeping main server version"
 *                 permanent: true
 *     responses:
 *       200:
 *         description: Game deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Game deleted successfully"
 *                 deleted_game:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 532
 *                     name:
 *                       type: string
 *                       example: "Test Game"
 *                     server:
 *                       type: string
 *                       example: "Global"
 *                 deletion_type:
 *                   type: string
 *                   enum: ["soft", "permanent"]
 *                   example: "soft"
 *                 deleted_by:
 *                   type: string
 *                   example: "admin_user"
 *                 deletion_reason:
 *                   type: string
 *                   example: "Game discontinued"
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Game not found
 *       500:
 *         description: Server error
 */
updateRouter.delete('/delete/game/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, permanent = false } = req.body;
        const user = req.user!;

        // Check if game exists and is currently active
        const gameCheck = await database.query(
            'SELECT * FROM games WHERE id = $1 AND is_active = true',
            [id]
        );

        if (gameCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'Game not found or already deleted'
            });
        }

        const gameToDelete = gameCheck.rows[0];

        let deletionType;

        if (permanent) {
            // Permanent deletion - actually remove from database
            await database.query(
                'DELETE FROM games WHERE id = $1 RETURNING *',
                [id]
            );
            deletionType = 'permanent';

            console.log(`🗑️ Game PERMANENTLY deleted by ${user.username}:`, {
                gameId: id,
                gameName: gameToDelete.name,
                server: gameToDelete.server,
                reason: reason || 'No reason provided',
                deletedBy: user.username,
                timestamp: new Date().toISOString(),
                WARNING: 'PERMANENT DELETION - CANNOT BE UNDONE'
            });
        } else {
            // Soft deletion - set is_active = false
            await database.query(
                'UPDATE games SET is_active = false, last_verified = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
                [id]
            );
            deletionType = 'soft';

            console.log(`🗑️ Game soft deleted by ${user.username}:`, {
                gameId: id,
                gameName: gameToDelete.name,
                server: gameToDelete.server,
                reason: reason || 'No reason provided',
                deletedBy: user.username,
                timestamp: new Date().toISOString(),
                note: 'Soft deletion - can be restored by setting is_active = true'
            });
        }

        res.json({
            message: 'Game deleted successfully',
            deleted_game: {
                id: parseInt(id),
                name: gameToDelete.name,
                server: gameToDelete.server
            },
            deletion_type: deletionType,
            deleted_by: user.username,
            deletion_reason: reason || 'No reason provided'
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error deleting game:', errorMessage);
        res.status(500).json({ error: 'Failed to delete game' });
    }
});

export { updateRouter };