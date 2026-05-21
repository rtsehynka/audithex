#!/usr/bin/env node
/**
 * Captures a fixed set of Puppeteer screenshots of the local web UI
 * into ~/Desktop/audithex-u2-<YYYY-MM-DD>/. Boots an isolated stack
 * (in-memory MongoDB + seeded user + one banking-bot scan persisted
 * through the CLI + `next start`) so the run is fully self-contained
 * and the history list / detail page are never empty.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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

async function pageCookieString(page) {
  const jar = await page.cookies();
  return jar.map((c) => `${c.name}=${c.value}`).join('; ');
}

function makeCleanProject() {
  const dir = mkdtempSync(join(tmpdir(), 'audithex-clean-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(
    join(dir, 'src', 'safe.ts'),
    'export function safe(x: number): number {\n  return x + 1;\n}\n',
    'utf8',
  );
  return dir;
}

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

  console.log('[screenshots] seeding clean + banking-bot scans via the CLI…');
  const cliBin = resolve(repoRoot, 'apps', 'cli', 'bin', 'audithex.js');
  const fixture = resolve(repoRoot, 'fixtures', 'fixture-banking-bot');
  const cleanProject = makeCleanProject();
  const seededIds = [];
  for (const target of [cleanProject, fixture]) {
    const cliResult = spawnSync('node', [cliBin, 'scan', target, '--report', 'json'], {
      env: { ...process.env, MONGODB_URI: uri },
      encoding: 'utf8',
    });
    if (!cliResult.stdout.includes('Saved scan run')) {
      throw new Error(
        `audithex scan did not persist for ${target} (exit=${cliResult.status}): ${cliResult.stderr || cliResult.stdout}`,
      );
    }
    const id = cliResult.stdout.match(/Saved scan run ([a-f0-9]{24})/)?.[1];
    if (!id) throw new Error('could not parse seeded scan id from CLI output');
    seededIds.push(id);
  }
  const [cleanScanId, bankingBotScanId] = seededIds;
  const seededId = bankingBotScanId;

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
      AUDITHEX_LLM_DRY_RUN: 'true',
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
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

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

  console.log('[screenshots] sign in → / (history list)…');
  await page.goto(`http://localhost:${PORT}/login`, { waitUntil: 'load' });
  await page.type('[data-testid=login-email]', EMAIL);
  await page.type('[data-testid=login-password]', PASSWORD);
  await Promise.all([
    page.click('[data-testid=login-submit]'),
    page.waitForNavigation({ waitUntil: 'load', timeout: 15_000 }),
  ]);
  await page.waitForSelector('[data-testid=scan-table]', { timeout: 10_000 });
  await page.screenshot({ path: resolve(outDir, '03-scan-history.png'), fullPage: true });

  console.log(`[screenshots] /scans/${seededId} (detail)…`);
  await page.goto(`http://localhost:${PORT}/scans/${seededId}`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=scan-title]', { timeout: 10_000 });
  await page.screenshot({ path: resolve(outDir, '04-scan-detail.png'), fullPage: true });

  console.log(`[screenshots] /scans/${seededId} with first AI fix expanded…`);
  await page.click('[data-testid=ai-fix-button]');
  await page.waitForSelector('[data-testid=ai-fix-result]', { timeout: 15_000 });
  // Give the result card a moment to settle before snapshot.
  await new Promise((r) => setTimeout(r, 250));
  await page.screenshot({ path: resolve(outDir, '05-ai-fix-dry-run.png'), fullPage: true });

  console.log(`[screenshots] /scans/${seededId}/compare/${cleanScanId} (diff)…`);
  await page.goto(`http://localhost:${PORT}/scans/${seededId}/compare/${cleanScanId}`, {
    waitUntil: 'load',
  });
  await page.waitForSelector('[data-testid=compare-title]', { timeout: 10_000 });
  await page.screenshot({ path: resolve(outDir, '06-scan-compare.png'), fullPage: true });

  console.log('[screenshots] /settings…');
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=card-mongo]', { timeout: 10_000 });
  await page.screenshot({ path: resolve(outDir, '07-settings.png'), fullPage: true });

  console.log(`[screenshots] /scans/${seededId}/pdf (download)…`);
  const pdfResponse = await fetch(`http://localhost:${PORT}/scans/${seededId}/pdf`, {
    headers: { cookie: await pageCookieString(page) },
  });
  if (pdfResponse.status !== 200) {
    throw new Error(`pdf route returned ${pdfResponse.status}`);
  }
  const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
  const { writeFileSync: writeBin } = await import('node:fs');
  writeBin(resolve(outDir, '08-scan-report.pdf'), pdfBytes);

  console.log('[screenshots] sign out → /login…');
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await Promise.all([
    page.click('[data-testid=logout-button]'),
    page.waitForNavigation({ waitUntil: 'load', timeout: 15_000 }),
  ]);
  await page.screenshot({ path: resolve(outDir, '09-login-after-logout.png'), fullPage: false });

  console.log(`[screenshots] saved 8 PNGs + 1 PDF to ${outDir}`);
  await cleanup(0);
}

main().catch(async (err) => {
  console.error('[screenshots]', err);
  await cleanup(1);
});
