#!/usr/bin/env node
// Captures a fresh Heroku Postgres backup and downloads it into backups/ (gitignored).
// Run from the project root: npm run backup:pull  (needs the Heroku CLI, logged in)
//
// The dump holds user emails and password hashes: it stays in backups/, never commit it.
// Manual captures count toward Heroku's 5-manual-backup limit on essential-0; Heroku drops
// the oldest one itself. The DB URL is never read or printed here, only the Heroku CLI is used.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP = 'gachadailytracker';
const BACKUPS_DIR = path.join(__dirname, '../backups');

function heroku(args) {
  // shell: true so Windows resolves heroku.cmd
  return execSync(`heroku ${args} -a ${APP}`, { stdio: ['ignore', 'pipe', 'inherit'], shell: true }).toString();
}

if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

const stamp = new Date().toISOString().slice(0, 10);
let out = path.join(BACKUPS_DIR, `gdt-${stamp}.dump`);
for (let n = 2; fs.existsSync(out); n++) out = path.join(BACKUPS_DIR, `gdt-${stamp}-${n}.dump`);

try {
  console.log('Capturing a fresh backup on Heroku...');
  heroku('pg:backups:capture');
  console.log(`Downloading to ${path.relative(process.cwd(), out)}...`);
  heroku(`pg:backups:download --output "${out}"`);
  const kb = (fs.statSync(out).size / 1024).toFixed(1);
  console.log(`Done: ${path.basename(out)} (${kb} KB)`);
} catch (err) {
  console.error('Backup pull failed:', err.message);
  process.exit(1);
}
