import express, { Router } from 'express';
import database from '../config/database';

const iconsRouter: Router = express.Router();

const FILE_RE = /^(\d+)-([0-9a-f]{6,16})\.webp$/;

/**
 * @swagger
 * /gdt/icons/custom/{file}:
 *   get:
 *     summary: Custom game icon (admin-uploaded)
 *     tags: [Games]
 *     description: |
 *       Serves an icon from the game_icons table. `file` is `<gameId>-<hash>.webp`, which is
 *       what `games.icon_name = 'custom/<gameId>-<hash>'` maps to. The hash changes whenever
 *       the icon does, so responses are cached as immutable.
 *     parameters:
 *       - in: path
 *         name: file
 *         required: true
 *         schema:
 *           type: string
 *           example: 412-3fa9c01b2e.webp
 *     responses:
 *       200:
 *         description: The icon image
 *         content:
 *           image/webp: {}
 *       404:
 *         description: No such icon (or an outdated hash)
 */
iconsRouter.get('/custom/:file', async (req, res) => {
    const match = FILE_RE.exec(req.params.file);
    if (!match) return res.status(404).json({ error: 'Icon not found' });

    try {
        const result = await database.query(
            'SELECT data, mime FROM game_icons WHERE game_id = $1 AND hash = $2',
            [parseInt(match[1]), match[2]]
        );
        const row = result.rows[0];
        if (!row) return res.status(404).json({ error: 'Icon not found' });

        // helmet's default same-origin CORP would stop the Vercel frontend from loading this.
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.type(row.mime).send(row.data);
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('Icon fetch error:', msg);
        res.status(500).json({ error: 'Failed to load icon' });
    }
});

export { iconsRouter };
