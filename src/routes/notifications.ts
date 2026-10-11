import express, { Router } from 'express';
import database from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { webpush, isWebPushConfigured } from '../config/webpush';

const notificationsRouter: Router = express.Router();

/**
 * @swagger
 * /gdt/notifications/vapid-key:
 *   get:
 *     summary: Get VAPID public key
 *     tags: [Notifications]
 *     description: Returns the server's VAPID public key needed to create a push subscription in the browser.
 *     responses:
 *       200:
 *         description: VAPID public key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 publicKey:
 *                   type: string
 *                   example: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U"
 *       503:
 *         description: Push notifications not configured on this server
 */
// Public — frontend needs this before it can create a subscription
notificationsRouter.get('/vapid-key', (_req, res) => {
  if (!isWebPushConfigured()) {
    return res.status(503).json({ error: 'Push notifications not configured' });
  }
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// All routes below require auth
notificationsRouter.use(authenticateToken);

/**
 * @swagger
 * /gdt/notifications/subscribe:
 *   post:
 *     summary: Subscribe to push notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [endpoint, keys]
 *             properties:
 *               endpoint:
 *                 type: string
 *                 description: Push subscription endpoint URL
 *               keys:
 *                 type: object
 *                 required: [p256dh, auth]
 *                 properties:
 *                   p256dh:
 *                     type: string
 *                   auth:
 *                     type: string
 *     responses:
 *       201:
 *         description: Subscribed successfully; a confirmation push is sent
 *       400:
 *         description: Missing endpoint or keys
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Push notifications not configured
 */
// POST /subscribe
// Body: { endpoint: string, keys: { p256dh: string, auth: string } }
notificationsRouter.post('/subscribe', async (req, res) => {
  if (!isWebPushConfigured()) {
    return res.status(503).json({ error: 'Push notifications not configured' });
  }

  const { userId } = req.user!;
  const { endpoint, keys } = req.body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Missing endpoint or keys' });
  }

  try {
    await database.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, endpoint) DO NOTHING`,
      [userId, endpoint, keys.p256dh, keys.auth]
    );

    // Send a test push so the user knows it worked
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const payload = JSON.stringify({
      title: 'GachaDaily',
      body: 'Notifications enabled — we\'ll remind you before your resets.',
      icon: `${frontendUrl}/icons/placeholder.svg`,
      data: { url: '/' },
    });

    await webpush.sendNotification({ endpoint, keys }, payload).catch(() => {});

    res.status(201).json({ message: 'Subscribed' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error saving push subscription:', msg);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

/**
 * @swagger
 * /gdt/notifications/unsubscribe:
 *   delete:
 *     summary: Remove push subscription
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [endpoint]
 *             properties:
 *               endpoint:
 *                 type: string
 *     responses:
 *       200:
 *         description: Unsubscribed successfully
 *       400:
 *         description: Missing endpoint
 *       401:
 *         description: Unauthorized
 */
// DELETE /unsubscribe
// Body: { endpoint: string }
notificationsRouter.delete('/unsubscribe', async (req, res) => {
  const { userId } = req.user!;
  const { endpoint } = req.body;

  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint' });
  }

  try {
    await database.query(
      'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
      [userId, endpoint]
    );
    res.json({ message: 'Unsubscribed' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error removing push subscription:', msg);
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

/**
 * @swagger
 * /gdt/notifications/preferences:
 *   get:
 *     summary: Get notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's notification preferences
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *                   description: Whether the user has at least one active push subscription
 *                 default_offset:
 *                   type: integer
 *                   description: Default reminder offset in minutes before reset
 *                   example: 30
 *       401:
 *         description: Unauthorized
 */
// GET /preferences
notificationsRouter.get('/preferences', async (req, res) => {
  const { userId } = req.user!;

  try {
    const [subResult, userResult] = await Promise.all([
      database.query(
        'SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id = $1',
        [userId]
      ),
      database.query(
        'SELECT notification_offset FROM users WHERE id = $1',
        [userId]
      ),
    ]);

    res.json({
      enabled: parseInt(subResult.rows[0].count, 10) > 0,
      default_offset: userResult.rows[0]?.notification_offset ?? 30,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching notification preferences:', msg);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

/**
 * @swagger
 * /gdt/notifications/apply-default:
 *   post:
 *     summary: Apply global default offset to all tracked games
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     description: Sets every game in the user's list to their current default reminder offset. Games already set to a specific time are overwritten.
 *     responses:
 *       200:
 *         description: Default applied
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 offset:
 *                   type: integer
 *                 updated:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 */
notificationsRouter.post('/apply-default', async (req, res) => {
  const { userId } = req.user!;
  try {
    const userResult = await database.query(
      'SELECT notification_offset FROM users WHERE id = $1',
      [userId]
    );
    const offset = userResult.rows[0]?.notification_offset ?? 30;
    const result = await database.query(
      'UPDATE user_games SET custom_reminder_offset = $1 WHERE user_id = $2',
      [offset, userId]
    );
    res.json({ message: 'Default applied to all games', offset, updated: result.rowCount ?? 0 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Apply default error:', msg);
    res.status(500).json({ error: 'Failed to apply default' });
  }
});

/**
 * @swagger
 * /gdt/notifications/preferences:
 *   patch:
 *     summary: Update notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               default_offset:
 *                 type: integer
 *                 description: Default reminder offset in minutes (0–1440)
 *                 example: 30
 *     responses:
 *       200:
 *         description: Preferences updated
 *       400:
 *         description: Nothing to update or invalid value
 *       401:
 *         description: Unauthorized
 */
// PATCH /preferences
// Body: { default_offset?: number }
notificationsRouter.patch('/preferences', async (req, res) => {
  const { userId } = req.user!;
  const { default_offset } = req.body;

  if (default_offset === undefined) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  const offset = Math.max(0, Math.min(1440, parseInt(default_offset, 10)));
  if (isNaN(offset)) {
    return res.status(400).json({ error: 'default_offset must be a number' });
  }

  try {
    await database.query(
      'UPDATE users SET notification_offset = $1 WHERE id = $2',
      [offset, userId]
    );
    res.json({ message: 'Preferences updated', default_offset: offset });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error updating notification preferences:', msg);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// GET /email-preferences
notificationsRouter.get('/email-preferences', async (req, res) => {
  const { userId } = req.user!;
  try {
    const result = await database.query(
      `SELECT email_digest_enabled, email_digest_hour, email_verified FROM users WHERE id = $1`,
      [userId]
    );
    res.json({
      email_digest_enabled: result.rows[0].email_digest_enabled,
      email_digest_hour:    result.rows[0].email_digest_hour,
      email_verified:       result.rows[0].email_verified,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching email preferences:', msg);
    res.status(500).json({ error: 'Failed to fetch email preferences' });
  }
});

// PATCH /email-preferences
// Body: { email_digest_enabled?: boolean, email_digest_hour?: number }
notificationsRouter.patch('/email-preferences', async (req, res) => {
  const { userId } = req.user!;
  const { email_digest_enabled, email_digest_hour } = req.body;

  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  // The digest only ever goes to a confirmed address (the cron also filters on this).
  // Turning it off is always allowed.
  if (email_digest_enabled === true) {
    try {
      const v = await database.query('SELECT email_verified FROM users WHERE id = $1', [userId]);
      if (!v.rows[0]?.email_verified) {
        return res.status(403).json({
          error: 'Verify your email before turning on the daily digest.',
          code: 'email_unverified',
        });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error checking email verification:', msg);
      return res.status(500).json({ error: 'Failed to update email preferences' });
    }
  }

  if (email_digest_enabled !== undefined) {
    updates.push(`email_digest_enabled = $${idx++}`);
    values.push(Boolean(email_digest_enabled));
  }
  if (email_digest_hour !== undefined) {
    const hour = Math.max(0, Math.min(23, parseInt(email_digest_hour, 10)));
    if (isNaN(hour)) return res.status(400).json({ error: 'Invalid hour' });
    updates.push(`email_digest_hour = $${idx++}`);
    values.push(hour);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  values.push(userId);
  try {
    await database.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`,
      values
    );
    res.json({ message: 'Email preferences updated' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error updating email preferences:', msg);
    res.status(500).json({ error: 'Failed to update email preferences' });
  }
});

export { notificationsRouter };
