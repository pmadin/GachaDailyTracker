import { Request, Response, NextFunction } from 'express';
import database from '../config/database';

/**
 * Blocks features that need a confirmed email (game submissions, the play scheduler).
 * Must run after authenticateToken. Checks the DB on every call rather than trusting the
 * JWT, so verifying (or changing email) takes effect without logging in again.
 * Admin routes get the same check inside requireAdmin.
 */
export const requireVerifiedEmail = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await database.query(
            'SELECT email_verified FROM users WHERE id = $1',
            [req.user!.userId]
        );
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }
        if (!result.rows[0].email_verified) {
            return res.status(403).json({
                error: 'Verify your email to use this feature.',
                code: 'email_unverified',
            });
        }
        next();
    } catch (error: unknown) {
        console.error('Verified-email check failed:', error instanceof Error ? error.message : error);
        return res.status(500).json({ error: 'Failed to check email verification' });
    }
};
