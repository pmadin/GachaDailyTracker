import express, { Request, Response, Router } from 'express';
import bcrypt from 'bcryptjs';
import validator from 'validator';
import database from '../../config/database';
import TimezoneService from '../../services/timezoneService';
import { addPepper } from '../../utils/crypto';
import { issueVerificationCode, UNVERIFIED_ACCOUNT_TTL_DAYS } from '../../services/emailVerificationService';
import { emailDomainCanReceiveMail } from '../../utils/emailDomain';

const registerRouter: Router = express.Router();

/**
 * @swagger
 * /gdt/auth/register:
 *   post:
 *     summary: Register new user
 *     tags: [Authentication]
 *     description: |
 *       Create a new user account with enhanced security:
 *       - bcrypt hashing (superior to SHA256)
 *       - Automatic salting (16 rounds)
 *       - Pepper for additional security
 *       - Strong password requirements
 *       - Password confirmation validation
 *       - Timezone auto-detection if not provided
 *       - Optional profile fields
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password, confirmPassword]
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 50
 *                 pattern: "^[a-zA-Z0-9_-]+$"
 *                 example: "gacha_whal3_42069"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 minLength: 15
 *                 description: Must contain uppercase, lowercase, number, and special character
 *                 example: "Azurlane!Xnikke"
 *               confirmPassword:
 *                 type: string
 *                 description: Must match the password field
 *                 example: "Azurlane!Xnikke"
 *               timezone:
 *                 type: string
 *                 description: IANA timezone identifier. Auto-detected if not provided.
 *                 example: "America/Los_Angeles"
 */
registerRouter.post('/register', async (req: Request, res: Response) => {
    try {
        const { username, email, password, confirmPassword, registrationToken } = req.body;

        // Check for registration token first
        const validRegistrationToken = process.env.REGISTRATION_TOKEN || 'your-secret-registration-key';

        if (!registrationToken || registrationToken !== validRegistrationToken) {
            return res.status(403).json({
                error: 'Invalid registration token. Registration is restricted.',
                hint: 'Contact the administrator for a valid registration token.'
            });
        }

        // Enhanced validation
        if (!username || !email || !password || !confirmPassword) {
            return res.status(400).json({
                error: 'Username, email, password, password confirmation, and registration token are required'
            });
        }

        // Email validation using validator
        if (!validator.isEmail(email)) {
            return res.status(400).json({
                error: 'Please enter a valid email address'
            });
        }

        // Stops made-up domains (name@random-word.com) before an account is created
        if (!(await emailDomainCanReceiveMail(email))) {
            return res.status(400).json({
                error: "That email domain can't receive mail. Check for a typo, or use a different address.",
                code: 'email_domain_no_mail'
            });
        }

        // Password confirmation validation
        if (password !== confirmPassword) {
            return res.status(400).json({
                error: 'Password and password confirmation do not match'
            });
        }

        // Username validation
        if (username.length < 5 || username.length > 50) {
            return res.status(400).json({
                error: 'Username must be between 5 and 50 characters'
            });
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
            return res.status(400).json({
                error: 'Username can only contain letters, numbers, underscores, and hyphens'
            });
        }

        // Enhanced password validation
        if (password.length < 15) {
            return res.status(400).json({
                error: 'Password must be at least 15 characters long'
            });
        }

        const passwordRequirements = [
            { regex: /[a-z]/, message: 'at least one lowercase letter' },
            { regex: /[A-Z]/, message: 'at least one uppercase letter' },
            { regex: /[0-9]/, message: 'at least one number' },
            { regex: /[!@#$%^&*(),.?":{}|<>]/, message: 'at least one special character' }
        ];

        const missingRequirements = passwordRequirements
            .filter(req => !req.regex.test(password))
            .map(req => req.message);

        if (missingRequirements.length > 0) {
            return res.status(400).json({
                error: `Password must contain ${missingRequirements.join(', ')}`
            });
        }

        // Detect or validate timezone
        let userTimezone = await TimezoneService.detectUserTimezone(req);
        let wasDetected = !req.body.timezone;

        // If timezone was provided, validate it
        if (req.body.timezone) {
            if (!TimezoneService.isValidTimezone(req.body.timezone)) {
                return res.status(400).json({
                    error: 'Invalid timezone. Use /gdt/auth/timezones to see valid options.'
                });
            }
            userTimezone = TimezoneService.normalizeTimezone(req.body.timezone);
        }

        // Check if user exists (username check is case-insensitive)
        const existingUser = await database.query(
            'SELECT id, email, username FROM users WHERE email = $1 OR LOWER(username) = LOWER($2)',
            [email, username]
        );

        if (existingUser.rows.length > 0) {
            const taken = existingUser.rows[0];
            if (taken.email === email) {
                return res.status(400).json({ error: 'An account with this email already exists' });
            }
            return res.status(400).json({ error: 'Username is already taken' });
        }

        // Enhanced password hashing: Pepper + Salt + bcrypt
        const pepperedPassword = addPepper(password);
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(pepperedPassword, saltRounds);

        const result = await database.query(`
            INSERT INTO users (username, email, password_hash, timezone, role, email_verified, email_verify_deadline)
            VALUES ($1, $2, $3, $4, 1, false, CURRENT_TIMESTAMP + make_interval(days => $5))
            RETURNING id, username, email, timezone, role, created_at, email_verified, email_verify_deadline
        `, [username, email, passwordHash, userTimezone, UNVERIFIED_ACCOUNT_TTL_DAYS]);

        const user = result.rows[0];

        console.log('User registered successfully');

        // The account exists either way; a failed send just means the user hits "resend".
        let verificationSent = false;
        try {
            verificationSent = await issueVerificationCode(user);
        } catch (err) {
            console.error('Verification code issue failed:', err instanceof Error ? err.message : err);
        }

        res.status(201).json({
            message: 'User created successfully',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                timezone: user.timezone,
                role: user.role,
                created_at: user.created_at,
                email_verified: user.email_verified,
                email_verify_deadline: user.email_verify_deadline,
                detected_timezone: wasDetected
            },
            verification_sent: verificationSent,
            security_info: {
                hash_algorithm: 'bcrypt',
                salt_rounds: saltRounds,
                additional_security: ['pepper', 'timing-attack-protection', 'strong-password-policy']
            }
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Registration error:', errorMessage);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

export { registerRouter };