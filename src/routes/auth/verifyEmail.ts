import express, { Request, Response, Router } from 'express';
import database from '../../config/database';
import { authenticateToken } from '../../middleware/auth';
import {
    issueVerificationCode,
    normalizeCode,
    secondsUntilResend,
    verifyCode,
    MAX_ATTEMPTS,
} from '../../services/emailVerificationService';

const verifyEmailRouter: Router = express.Router();

/**
 * @swagger
 * /gdt/auth/verify-email:
 *   post:
 *     summary: Confirm the account's email with the 6-digit code that was emailed
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code:
 *                 type: string
 *                 example: "042817"
 *     responses:
 *       200:
 *         description: Email verified (or was already verified)
 *       400:
 *         description: Wrong or malformed code (includes attempts_left)
 *       410:
 *         description: Code expired or no code issued, request a new one
 *       429:
 *         description: Too many wrong attempts on this code, request a new one
 */
verifyEmailRouter.post('/verify-email', authenticateToken, async (req: Request, res: Response) => {
    const code = normalizeCode(req.body?.code);
    if (!code) {
        return res.status(400).json({ error: 'Enter the 6-digit code from the email.' });
    }

    try {
        const result = await verifyCode(req.user!.userId, code);

        switch (result.status) {
            case 'verified':
                console.log(`Email verified for user ${req.user!.userId}`);
                return res.json({ message: 'Email verified', email_verified: true });
            case 'already_verified':
                return res.json({ message: 'Email is already verified', email_verified: true });
            case 'invalid':
                return res.status(400).json({
                    error: `That code isn't right. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? 'try' : 'tries'} left.`,
                    attempts_left: result.attemptsLeft,
                });
            case 'too_many_attempts':
                return res.status(429).json({
                    error: `Too many wrong tries (${MAX_ATTEMPTS}). Request a new code.`,
                });
            case 'expired':
                return res.status(410).json({ error: 'This code has expired. Request a new one.' });
            case 'no_code':
                return res.status(410).json({ error: 'No active code. Request a new one.' });
        }
    } catch (error: unknown) {
        console.error('Email verify error:', error instanceof Error ? error.message : error);
        return res.status(500).json({ error: 'Failed to verify email' });
    }
});

/**
 * @swagger
 * /gdt/auth/verify-email/resend:
 *   post:
 *     summary: Email a new verification code (replaces any previous code)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: New code sent
 *       400:
 *         description: Email is already verified
 *       429:
 *         description: Asked too soon after the last code (includes retry_after seconds)
 *       502:
 *         description: Code created but the email provider failed to send it
 */
verifyEmailRouter.post('/verify-email/resend', authenticateToken, async (req: Request, res: Response) => {
    const userId = req.user!.userId;

    try {
        const userResult = await database.query(
            'SELECT id, username, email, email_verified FROM users WHERE id = $1',
            [userId]
        );
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];
        if (user.email_verified) {
            return res.status(400).json({ error: 'Email is already verified', email_verified: true });
        }

        const wait = await secondsUntilResend(userId);
        if (wait > 0) {
            return res.status(429).json({
                error: `Please wait ${wait}s before requesting another code.`,
                retry_after: wait,
            });
        }

        const sent = await issueVerificationCode(user);
        if (!sent) {
            return res.status(502).json({ error: "Couldn't send the email right now. Try again in a minute." });
        }
        return res.json({ message: 'A new code is on its way.' });
    } catch (error: unknown) {
        console.error('Verification resend error:', error instanceof Error ? error.message : error);
        return res.status(500).json({ error: 'Failed to send a new code' });
    }
});

export { verifyEmailRouter };
