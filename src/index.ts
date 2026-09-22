import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import database from './config/database';
import gameRoutes from './routes/games';
import { authRoutes } from './routes/auth';
import { timezoneRoutes } from './routes/timezone';
import { roleRouter } from './routes/closed/roles';
import { updateRouter} from './routes/closed/close';
import { trackerRouter } from './routes/tracker/tracker';
import autoImportService from './services/autoImportService';
import { specs, swaggerUi, swaggerOptions } from './config/swagger';
import { notificationsRouter } from './routes/notifications';
import { adminGamesRouter } from './routes/admin/games';
import { submissionsRouter, adminSubmissionsRouter } from './routes/submissions';
import leaderboardRouter from './routes/leaderboard';
import adminSettingsRouter from './routes/admin/settings';
import analyticsRouter from './routes/admin/analytics';
import { authenticateToken } from './middleware/auth';
import { initWebPush } from './config/webpush';
import { startNotificationCron } from './workers/notificationCron';
import { startStreakAuditCron } from './workers/streakAuditCron';
import { startEmailDigestCron } from './workers/emailDigestCron';
import passwordResetRouter from './routes/auth/passwordReset';
import scheduleRouter from './routes/schedule';

// Load environment variables - try multiple file names
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            connectSrc: ["'self'"],
        },
    },
}));
app.use(cors());
app.use(express.json());

// Serve static files - handle both development and production paths
const publicPaths = [
    path.join(__dirname, 'public'),           // Production: dist/public
    path.join(__dirname, '..', 'src', 'public'), // Development: from dist/ to src/public
    path.join(process.cwd(), 'src', 'public'), // Development: from root to src/public
    path.join(process.cwd(), 'dist', 'public'), // Production: from root to dist/public
    path.join(process.cwd(), 'public')        // Fallback: root/public
];

// Try each path and use the first one that exists
let publicPath = publicPaths[0]; // Default fallback
const fs = require('fs');
for (const testPath of publicPaths) {
    try {
        if (fs.existsSync(testPath)) {
            publicPath = testPath;
            console.log(`📁 Using public directory: ${publicPath}`);
            break;
        } else {
            console.log(`📁 Path not found: ${testPath}`);
        }
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`📁 Error checking path ${testPath}:`, errorMessage);
    }
}

app.use('/public', express.static(publicPath));

// Favicon routes - serve from the images directory
app.get('/favicon.svg', (req, res) => {
    const svgPath = path.join(publicPath, 'images', 'favicon.svg');
    res.setHeader('Content-Type', 'image/svg+xml');
    res.sendFile(svgPath, (err) => {
        if (err) res.status(404).send('Not found');
    });
});

app.get('/favicon.ico', (req, res) => {
    const faviconPath = path.join(publicPath, 'images', 'favicon.ico');
    res.sendFile(faviconPath, (err) => {
        if (err) {
            // Fallback to gold G SVG
            const fallbackPath = path.join(publicPath, 'favicon.svg');
            res.setHeader('Content-Type', 'image/svg+xml');
            res.sendFile(fallbackPath, (fallbackErr) => {
                if (fallbackErr) {
                    res.status(404).send('Favicon not found');
                }
            });
        }
    });
});

// Additional favicon routes for different sizes
app.get('/favicon-:size.png', (req, res) => {
    const { size } = req.params;
    const faviconPath = path.join(publicPath, 'images', `favicon-${size}.png`);
    res.sendFile(faviconPath, (err) => {
        if (err) {
            res.redirect('/favicon.ico');
        }
    });
});

// Apple touch icon
app.get('/apple-touch-icon.png', (req, res) => {
    const applePath = path.join(publicPath, 'images', 'apple-touch-icon.png');
    res.sendFile(applePath, (err) => {
        if (err) {
            res.redirect('/favicon.ico');
        }
    });
});

// Web manifest
app.get('/site.webmanifest', (req, res) => {
    const manifestPath = path.join(publicPath, 'images', 'site.webmanifest');
    res.sendFile(manifestPath, (err) => {
        if (err) {
            res.status(404).json({ error: 'Manifest not found' });
        }
    });
});

// API Documentation
app.use('/gdt/api-docs', swaggerUi.serve, swaggerUi.setup(specs, swaggerOptions));

// Routes
app.use('/gdt/games', gameRoutes);
app.use('/gdt/timezones', timezoneRoutes);
app.use('/gdt/auth', authRoutes);
app.use('/gdt/auth', passwordResetRouter);
app.use('/gdt/admin', roleRouter);
app.use('/gdt/admin', adminGamesRouter);
app.use('/gdt/update', updateRouter);
app.use('/gdt/tracker', trackerRouter);
app.use('/gdt/notifications', notificationsRouter);
app.use('/gdt/submissions', authenticateToken, submissionsRouter);
app.use('/gdt/admin', adminSubmissionsRouter);
app.use('/gdt/leaderboard', leaderboardRouter);
app.use('/gdt/admin', adminSettingsRouter);
app.use('/gdt/admin', analyticsRouter);
app.use('/gdt/schedule', authenticateToken, scheduleRouter);

/**
 * @swagger
 * /:
 *   get:
 *     summary: API Information (Root)
 *     tags: [Health]
 *     description: Root endpoint - redirects to API documentation
 *     responses:
 *       302:
 *         description: Redirect to API documentation
 */
app.get('/', (req, res) => {
    // Redirect to API docs for better user experience
    res.redirect('/gdt/api-docs');
});

/**
 * @swagger
 * /gdt/:
 *   get:
 *     summary: API Information
 *     tags: [Health]
 *     description: Get basic information about the Gacha Daily Tracker API
 *     responses:
 *       200:
 *         description: API information and available endpoints
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Gacha Daily Tracker API"
 *                 version:
 *                   type: string
 *                   example: "1.0.0"
 *                 status:
 *                   type: string
 *                   example: "running"
 *                 endpoints:
 *                   type: object
 *                   properties:
 *                     games:
 *                       type: string
 *                       example: "/gdt/games"
 *                     auth:
 *                       type: string
 *                       example: "/gdt/auth"
 *                     timezones:
 *                       type: string
 *                       example: "/gdt/timezones"
 *                     health:
 *                       type: string
 *                       example: "/gdt/health"
 *                     import:
 *                       type: string
 *                       example: "/gdt/games/import"
 *                     docs:
 *                       type: string
 *                       example: "/gdt/api-docs"
 */
app.get('/gdt/', (req, res) => {
    res.sendFile(path.join(publicPath, 'home.html'));
});

/**
 * @swagger
 * /gdt/health:
 *   get:
 *     summary: Health Check
 *     tags: [Health]
 *     description: Check the health status of the API and database connection
 *     responses:
 *       200:
 *         description: System is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "OK"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 database:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: "healthy"
 *       500:
 *         description: System error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get('/gdt/health', async (req, res) => {
    try {
        const dbHealth = await database.healthCheck();
        const backupInfo = await autoImportService.getBackupInfo();

        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            database: dbHealth,
            backup_file: backupInfo
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        res.status(500).json({
            status: 'ERROR',
            timestamp: new Date().toISOString(),
            error: errorMessage
        });
    }
});

// Serve the status.js file directly as a fallback
app.get('/public/status.js', (req, res) => {
    const statusJS = `
// Status page JavaScript
console.log('Status.js loaded successfully');

async function checkStatus() {
    console.log('checkStatus function called');
    
    const statusCard = document.getElementById('statusCard');
    const overallStatus = document.getElementById('overallStatus');
    const statusText = document.getElementById('statusText');
    const timestamp = document.getElementById('timestamp');
    const servicesDiv = document.getElementById('services');
    const lastUpdated = document.getElementById('lastUpdated');

    // Show loading state
    statusCard.classList.add('loading');
    statusText.textContent = 'Checking...';

    try {
        // Fetch status from the current domain
        console.log('Fetching status from /gdt/health...');
        const response = await fetch('/gdt/health');
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(\`HTTP error! status: \${response.status}\`);
        }
        
        const data = await response.json();
        console.log('Data received:', data);

        // Update overall status
        const isHealthy = data.status === 'OK' && data.database?.status === 'healthy';
        
        overallStatus.className = \`status-indicator \${isHealthy ? 'status-operational' : 'status-error'}\`;
        statusText.textContent = isHealthy ? 'All Systems Operational' : 'System Issues Detected';

        // Convert UTC timestamp to local time
        const utcTime = new Date(data.timestamp);
        const localTime = utcTime.toLocaleString();
        timestamp.textContent = \`Last checked: \${localTime}\`;

        // Update services
        const services = [
            {
                name: 'API Server',
                status: data.status === 'OK' ? 'Operational' : 'Issues',
                healthy: data.status === 'OK'
            },
            {
                name: 'Database',
                status: data.database?.status === 'healthy' ? 'Operational' : 'Issues',
                healthy: data.database?.status === 'healthy'
            },
            {
                name: 'Game Data Sync',
                status: data.backup_file?.exists ? 'Operational' : 'Pending',
                healthy: data.backup_file?.exists !== false
            },
            {
                name: 'Authentication',
                status: 'Operational',
                healthy: true
            }
        ];

        servicesDiv.innerHTML = services.map(service => \`
            <div class="service \${service.healthy ? '' : 'error'}">
                <h3>\${service.name}</h3>
                <div class="service-status">\${service.status}</div>
            </div>
        \`).join('');

        // Update last updated time
        lastUpdated.textContent = new Date().toLocaleString();

    } catch (error) {
        console.error('Error fetching status:', error);
        
        overallStatus.className = 'status-indicator status-error';
        statusText.textContent = 'Unable to Check Status';
        timestamp.textContent = \`Connection failed: \${error.message}\`;
        
        servicesDiv.innerHTML = \`
            <div class="service error">
                <h3>Connection Error</h3>
                <div class="service-status">Unable to reach server: \${error.message}</div>
            </div>
        \`;
    } finally {
        statusCard.classList.remove('loading');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Content Loaded - Initializing status page');
    
    // Add event listener for refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            console.log('Refresh button clicked');
            checkStatus();
        });
        console.log('Refresh button event listener added');
    } else {
        console.error('Refresh button not found!');
    }

    // Check status on page load
    console.log('Starting initial status check');
    checkStatus();

    // Auto-refresh every 30 seconds
    console.log('Setting up auto-refresh interval');
    setInterval(checkStatus, 30000);
});

// Fallback: if DOMContentLoaded has already fired
if (document.readyState === 'loading') {
    console.log('DOM still loading, waiting for DOMContentLoaded');
} else {
    console.log('DOM already loaded, initializing immediately');
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            console.log('Refresh button clicked');
            checkStatus();
        });
    }
    checkStatus();
    setInterval(checkStatus, 30000);
}
`;

    res.set('Content-Type', 'application/javascript');
    res.send(statusJS);
});

/**
 * @swagger
 * /gdt/status:
 *   get:
 *     summary: Status Page (HTML)
 *     tags: [Health]
 *     description: Visual status page showing system health with modern UI
 *     responses:
 *       200:
 *         description: HTML status page
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
app.get('/gdt/status', (req, res) => {
    res.sendFile(path.join(publicPath, 'status.html'));
});

// Auto-import data on startup
async function initializeApp() {
    try {
        console.log('🚀 Starting Gacha Daily Tracker API...');

        // Wait a moment for database to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check and auto-import initial data
        await autoImportService.checkAndImportInitialData();

        // Initialize web push and start notification cron
        initWebPush();
        startNotificationCron();
        startStreakAuditCron();
        startEmailDigestCron();

        // Start server
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📍 Local: http://localhost:${PORT}`);
            console.log(`🎮 Games API: http://localhost:${PORT}/gdt/games`);
            console.log(`🌐 Timezones API: http://localhost:${PORT}/gdt/timezones`);
            console.log(`💚 Health check: http://localhost:${PORT}/gdt/health`);
            console.log(`✅ Status: http://localhost:${PORT}/gdt/status`);
            console.log(`📚 API Documentation: http://localhost:${PORT}/gdt/api-docs`);
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Failed to initialize app:', errorMessage);
        process.exit(1);
    }
}

// Initialize the app
initializeApp();

export default app;