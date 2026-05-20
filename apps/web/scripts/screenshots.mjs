#!/usr/bin/env node
/**
 * Captures a fixed set of Puppeteer screenshots of the local web UI
 * into ~/Desktop/audithex-u2-<YYYY-MM-DD>/. Boots an isolated stack
 * (in-memory MongoDB + seeded user + `next start`) so the run is
 * fully self-contained.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, '..');
const repoRoot = resolve(webDir, '..', '..');

const EMAIL = 'tester@audithex.local';
const PASSWORD = 'tester-password-123';
const PORT = Number(process.env.AUDITHEX_E2E_PORT ?? 7777);
const dateStr = new Date().toISOString().slice(0, 10);
const outDir = resolve(homedir(), 'Desktop', `audithex-u2-${dateStr}`);
mkdirSync(outDir, { recursive: true });

const cleanupSteps = [];
const addCleanup = (label, fn) => cleanupSteps.push({ label, fn });

async function cleanup(code) {
  for (const step of [...cleanupSteps].reverse()) {
    try {
      await step.fn();
    } catch (err) {
      console.error(`cleanup '${step.label}' failed:`, err);
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => cleanup(130));
process.on('SIGTERM', () => cleanup(143));

function locateBin(name) {
  const candidates = [
    resolve(webDir, 'node_modules', '.bin', name),
    resolve(repoRoot, 'node_modules', '.bin', name),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolveOk, reject) => {
    const probe = async () => {
      try {
        const res = await fetch(url, { redirect: 'manual' });
        if (res.status < 500) return resolveOk();
      } catch {
        // not ready yet
      }
      if (Date.now() > deadline) {
        return reject(new Error(`server at ${url} did not respond in ${timeoutMs} ms`));
      }
      setTimeout(probe, 500);
    };
    probe();
  });
}

async function main() {
  const { MongoMemoryServer } = await import(
    resolve(repoRoot, 'node_modules', 'mongodb-memory-server', 'index.js')
  );
  console.log('[screenshots] starting in-memory MongoDB…');
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  addCleanup('mongo', () => mongo.stop());

  const persistence = await import(
    resolve(repoRoot, 'packages', 'core-persistence', 'dist', 'index.js')
  );
  const conn = await persistence.connectMongo(uri, { silent: true });
  await persistence.createUser(conn, {
    email: EMAIL,
    passwordHash: await persistence.hashPassword(PASSWORD),
  });
  await persistence.disconnectAll();

  const nextBin = locateBin('next');
  if (!nextBin) throw new Error('next binary not found');
  if (!existsSync(resolve(webDir, '.next'))) {
    throw new Error('apps/web must be built (yarn workspace @audithex/web run build) first');
  }

  console.log(`[screenshots] starting Next.js on port ${PORT}…`);
  const next = spawn(nextBin, ['start', '--port', String(PORT)], {
    cwd: webDir,
    env: {
      ...process.env,
      MONGODB_URI: uri,
      AUDITHEX_UI_SESSION_SECRET: '0123456789-screenshots-runner-32+',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  addCleanup('next', async () => {
    if (next.killed) return;
    next.kill('SIGTERM');
    await new Promise((res) => next.once('exit', res));
  });

  await waitForServer(`http://localhost:${PORT}/login`, 60_000);

  console.log('[screenshots] launching Puppeteer…');
  const { default: puppeteer } = await import(
    '/Users/rtsehynka/.claude-mcp/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js'
  );
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 120_000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  addCleanup('browser', () => browser.close());
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });

  console.log('[screenshots] /login (cold)…');
  await page.goto(`http://localhost:${PORT}/login`, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({
    path: resolve(outDir, '01-login-empty.png'),
    fullPage: false,
    timeout: 30_000,
  });

  console.log('[screenshots] /login with invalid creds…');
  await page.type('[data-testid=login-email]', 'wrong@example.com');
  await page.type('[data-testid=login-password]', 'wrong-pass-1234');
  await Promise.all([
    page.click('[data-testid=login-submit]'),
    page.waitForSelector('[data-testid=login-error]', { timeout: 10_000 }),
  ]);
  await page.screenshot({ path: resolve(outDir, '02-login-error.png'), fullPage: false });

  console.log('[screenshots] valid credentials → /…');
  await page.goto(`http://localhost:${PORT}/login`, { waitUntil: 'load' });
  await page.type('[data-testid=login-email]', EMAIL);
  await page.type('[data-testid=login-password]', PASSWORD);
  await Promise.all([
    page.click('[data-testid=login-submit]'),
    page.waitForNavigation({ waitUntil: 'load', timeout: 15_000 }),
  ]);
  await page.screenshot({ path: resolve(outDir, '03-home-after-login.png'), fullPage: false });

  console.log('[screenshots] sign out → /login…');
  await Promise.all([
    page.click('[data-testid=logout-button]'),
    page.waitForNavigation({ waitUntil: 'load', timeout: 15_000 }),
  ]);
  await page.screenshot({ path: resolve(outDir, '04-login-after-logout.png'), fullPage: false });

  console.log(`[screenshots] saved 4 PNGs to ${outDir}`);
  await cleanup(0);
}

main().catch(async (err) => {
  console.error('[screenshots]', err);
  await cleanup(1);
});
