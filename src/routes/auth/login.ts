import express, { Request, Response, Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import database from '../../config/database';
import { addPepper, JWT_SECRET } from '../../utils/crypto';

const SALT_ROUNDS = 12;

const loginRouter: Router = express.Router();

/**
 * @swagger
 * /gdt/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     description: |
 *       Authenticate user with enhanced security measures:
 *       - Timing-attack protection
 *       - Pepper verification
 *       - Secure JWT generation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier, password]
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: Email address or username
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 example: "MySecure123!Pass"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Login successful"
 *                 token:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     username:
 *                       type: string
 *                     email:
 *                       type: string
 *                     timezone:
 *                       type: string
 *                 expires_in:
 *                   type: string
 *                   example: "30 days"
 *       401:
 *         description: Invalid credentials
 *       500:
 *         description: Server error
 */
loginRouter.post('/login', async (req: Request, res: Response) => {
    try {
        const { identifier, password } = req.body;

        if (!identifier || !password) {
            return res.status(400).json({ error: 'Identifier and password are required' });
        }

        // Find user by email or username (username match is case-insensitive)
        const result = await database.query(
            'SELECT id, username, email, password_hash, timezone, role, email_verified, email_verify_deadline FROM users WHERE email = $1 OR LOWER(username) = LOWER($1)',
            [identifier]
        );

        if (result.rows.length === 0) {
            // Timing attack protection: still hash even if user doesn't exist
            await bcrypt.hash('dummy-password-to-prevent-timing-attacks', SALT_ROUNDS);
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = result.rows[0];

        // Enhanced password verification: Apply pepper then verify
        const pepperedPassword = addPepper(password);
        const validPassword = await bcrypt.compare(pepperedPassword, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Rehash if stored hash uses a different round count (e.g. old 16-round accounts)
        const hashRounds = bcrypt.getRounds(user.password_hash);
        if (hashRounds !== SALT_ROUNDS) {
            const newHash = await bcrypt.hash(pepperedPassword, SALT_ROUNDS);
            await database.query(
                'UPDATE users SET password_hash = $1 WHERE id = $2',
                [newHash, user.id]
            );
        }

        // Generate secure JWT — role intentionally excluded from payload
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                username: user.username,
                iat: Math.floor(Date.now() / 1000) // Issued at time
            },
            JWT_SECRET,
            {
                expiresIn: '30d',
                issuer: 'gacha-daily-tracker',
                audience: 'gacha-users'
            }
        );

        console.log('User login successful');

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                timezone: user.timezone,
                email_verified: user.email_verified,
                email_verify_deadline: user.email_verify_deadline
            },
            expires_in: '30 days'
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Login error:', errorMessage);
        res.status(500).json({ error: 'Login failed' });
    }
});

export { loginRouter };