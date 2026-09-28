import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Explicitly load .env.local file
dotenv.config({ path: path.join(__dirname, '../../.env.local') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

/** "host:port/dbname" without user or password, safe to log. */
function describeDbTarget(url: string | undefined): string {
    if (!url) return '(not set)';
    try {
        const u = new URL(url);
        return `${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname}`;
    } catch {
        return '(unparseable URL)';
    }
}

class Database {
    private pool: Pool;

    constructor() {
        console.log('🔍 Environment check:');
        console.log('  - DATABASE_URL:', process.env.DATABASE_URL ? 'Set ✅' : 'Missing ❌');
        console.log('  - NODE_ENV:', process.env.NODE_ENV || 'undefined');
        console.log('  - PORT:', process.env.PORT || 'undefined');

        if (!process.env.DATABASE_URL) {
            console.error('❌ DATABASE_URL environment variable is not set!');
            console.error('Current working directory:', process.cwd());
            console.error('Looking for .env files in:', path.join(process.cwd(), '.env.local'));
            process.exit(1);
        }

        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.DATABASE_URL?.includes('localhost') ? false : {
                rejectUnauthorized: false
            }
        });

        // Test connection on startup
        this.testConnection();
    }

    private async testConnection() {
        try {
            const client = await this.pool.connect();
            const result = await client.query('SELECT NOW()');
            console.log('🗄️  Database connected successfully at:', result.rows[0].now);
            client.release();
        } catch (error: unknown) {
            if (error instanceof Error && 'errors' in error && Array.isArray((error as any).errors)) {
                console.error('❌ Database connection failed (multiple errors):');
                (error as any).errors.forEach((e: unknown, i: number) => {
                    console.error(`  [${i}]`, e instanceof Error ? e.message : e);
                });
            } else if (error instanceof Error) {
                console.error('❌ Database connection failed:', error.message);
            } else {
                console.error('❌ Database connection failed:', error);
            }
            // Host and database name only: the full URL carries the password and would end up in the Heroku logs.
            console.error('💡 DATABASE_URL target:', describeDbTarget(process.env.DATABASE_URL));
            console.error('💡 If SSL error, try adding ?sslmode=disable to DATABASE_URL');
            process.exit(1);
        }
    }

    async query(text: string, params?: any[]) {
        const start = Date.now();
        try {
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;
            console.log(`📊 Query executed in ${duration}ms:`, text.slice(0, 50) + '...');
            return result;
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('❌ Query error:', error.message);
            } else {
                console.error('❌ Unknown query error occurred');
            }
            throw error;
        }
    }

    async getClient() {
        return await this.pool.connect();
    }

    async close() {
        await this.pool.end();
    }

    // Health check method
    async healthCheck() {
        try {
            const result = await this.query('SELECT 1 as status');
            return { status: 'healthy', timestamp: new Date().toISOString() };
        } catch (error: unknown) {
            if (error instanceof Error) {
                return { status: 'unhealthy', error: error.message };
            } else {
                return { status: 'unhealthy', error: 'An unknown error occurred' };
            }
        }
    }
}

export default new Database();