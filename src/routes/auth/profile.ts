import express, { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import database from '../../config/database';
import TimezoneService from '../../services/timezoneService';
import { JWT_SECRET } from '../../utils/crypto';

const profileRoutes: Router = express.Router();

/**
 * @swagger
 * /gdt/auth/profile:
 *   put:
 *     summary: Update user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     description: Update user profile including timezone and basic info (non-sensitive updates)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               timezone:
 *                 type: string
 *                 example: "Asia/Tokyo"
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Invalid input
 */
/**
 * @swagger
 * /gdt/auth/profile:
 *   get:
 *     summary: Get user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     description: Retrieve the authenticated user's profile information
 *     responses:
 *       200:
 *         description: Profile retrieved successfully. Includes streak_count (current) and streak_best (permanent, powers /profile streak badges).
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
profileRoutes.get('/profile', async (req: Request, res: Response) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(
            token,
            JWT_SECRET
        ) as any;

        const result = await database.query(
            `SELECT id, username, email, timezone, role, created_at, streak_count, streak_best
             FROM users WHERE id = $1`,
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: result.rows[0] });

    } catch (error: unknown) {
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Profile fetch error:', errorMessage);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

profileRoutes.put('/profile', async (req: Request, res: Response) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(
            token,
            JWT_SECRET
        ) as any;

        const { timezone } = req.body;
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (timezone) {
            if (!TimezoneService.isValidTimezone(timezone)) {
                return res.status(400).json({
                    error: 'Invalid timezone. Use /gdt/timezones/list to see valid options.'
                });
            }
            updates.push(`timezone = $${paramIndex}`);
            values.push(TimezoneService.normalizeTimezone(timezone));
            paramIndex++;
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No updates provided' });
        }

        // Add updated_at
        updates.push(`updated_at = CURRENT_TIMESTAMP`);

        // Add user id for WHERE clause
        values.push(decoded.userId);

        const query = `
            UPDATE users 
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING id, username, email, timezone, role
        `;

        const result = await database.query(query, values);

        res.json({
            message: 'Profile updated successfully',
            user: result.rows[0]
        });

    } catch (error: unknown) {
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Profile update error:', errorMessage);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

export { profileRoutes };