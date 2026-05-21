#!/usr/bin/env node
/**
 * Stand-alone Cypress orchestrator. Runs a fully self-contained e2e
 * pass for the local web UI:
 *
 *   1. starts mongodb-memory-server
 *   2. seeds one user (email/password from env or defaults)
 *   3. boots `next start` (or `next dev` with --dev) on port 7777
 *   4. waits for the server to respond
 *   5. invokes `cypress run`
 *   6. tears everything down on any exit path
 *
 * No external services required. Designed to be invoked through
 * `yarn workspace @audithex/web run cypress:e2e`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, '..');
const repoRoot = resolve(webDir, '..', '..');

const EMAIL = process.env.AUDITHEX_E2E_EMAIL ?? 'tester@audithex.local';
const PASSWORD = process.env.AUDITHEX_E2E_PASSWORD ?? 'tester-password-123';
const PORT = Number(process.env.AUDITHEX_E2E_PORT ?? 7777);
const DEV = process.argv.includes('--dev');

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

async function main() {
  const { MongoMemoryServer } = await import(
    resolve(repoRoot, 'node_modules', 'mongodb-memory-server', 'index.js')
  );
  console.log('[orchestrator] starting in-memory MongoDB…');
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  addCleanup('mongo', () => mongo.stop());
  console.log(`[orchestrator] mongo ready at ${uri}`);

  console.log('[orchestrator] seeding user', EMAIL);
  const persistence = await import(
    resolve(repoRoot, 'packages', 'core-persistence', 'dist', 'index.js')
  );
  const conn = await persistence.connectMongo(uri, { silent: true });
  const passwordHash = await persistence.hashPassword(PASSWORD);
  await persistence.createUser(conn, { email: EMAIL, passwordHash });
  await persistence.disconnectAll();

  console.log('[orchestrator] seeding banking-bot project via the CLI…');
  const cliBin = resolve(repoRoot, 'apps', 'cli', 'bin', 'audithex.js');
  const fixture = resolve(repoRoot, 'fixtures', 'fixture-banking-bot');
  const PROJECT_NAME = 'banking-bot';
  const projectResult = spawnSync(
    'node',
    [cliBin, 'project', 'create', '--name', PROJECT_NAME, '--root-path', fixture],
    { env: { ...process.env, MONGODB_URI: uri }, encoding: 'utf8' },
  );
  if (projectResult.status !== 0) {
    throw new Error(
      `audithex project create failed (exit=${projectResult.status}): ${projectResult.stderr || projectResult.stdout}`,
    );
  }

  console.log('[orchestrator] seeding scans via the CLI…');
  // The clean tmp scan goes first so the banking-bot scan ends up as the
  // newest row (createdAt desc → first row in the history table). The
  // banking-bot scan is attached to the project we just created so the
  // history table renders a project link and /projects/[id] shows the
  // run under its scan history.
  const seedTargets = [
    { target: makeCleanProject(), projectName: null },
    { target: fixture, projectName: PROJECT_NAME },
  ];
  for (const { target, projectName } of seedTargets) {
    const args = ['scan', target, '--report', 'json'];
    if (projectName) args.push('--project', projectName);
    const cliResult = spawnSync('node', [cliBin, ...args], {
      env: { ...process.env, MONGODB_URI: uri },
      encoding: 'utf8',
    });
    if (!cliResult.stdout.includes('Saved scan run')) {
      throw new Error(
        `audithex scan did not persist for ${target} (exit=${cliResult.status}): ${cliResult.stderr || cliResult.stdout}`,
      );
    }
  }

  const nextBin = locateBin('next');
  if (!nextBin) throw new Error('next binary not found in apps/web or repo-root node_modules');
  if (!DEV && !existsSync(resolve(webDir, '.next'))) {
    throw new Error(
      'apps/web has not been built. Run `yarn workspace @audithex/web run build` first or pass --dev.',
    );
  }

  console.log(`[orchestrator] starting Next.js (${DEV ? 'dev' : 'start'}) on port ${PORT}…`);
  const sessionSecret = '0123456789-orchestrator-cypress-32+';
  const next = spawn(nextBin, [DEV ? 'dev' : 'start', '--port', String(PORT)], {
    cwd: webDir,
    env: {
      ...process.env,
      MONGODB_URI: uri,
      AUDITHEX_UI_SESSION_SECRET: sessionSecret,
      AUDITHEX_LLM_DRY_RUN: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  next.stdout.on('data', (chunk) => process.stdout.write(`[next] ${chunk}`));
  next.stderr.on('data', (chunk) => process.stderr.write(`[next] ${chunk}`));
  addCleanup('next', async () => {
    if (next.killed) return;
    next.kill('SIGTERM');
    await new Promise((res) => next.once('exit', res));
  });

  await waitForServer(`http://localhost:${PORT}/login`, 60_000);
  console.log('[orchestrator] server is responding — invoking cypress run');

  await runCypress(uri);
  await cleanup(0);
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
      if (Date.now() > deadline)
        return reject(new Error(`server at ${url} did not respond within ${timeoutMs} ms`));
      setTimeout(probe, 500);
    };
    probe();
  });
}

function runCypress(uri) {
  return new Promise((resolveOk, reject) => {
    const cypressBin = locateBin('cypress') ?? 'cypress';
    const child = spawn(cypressBin, ['run', '--browser', 'electron', '--headless'], {
      cwd: webDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        CYPRESS_BASE_URL: `http://localhost:${PORT}`,
        CYPRESS_EMAIL: EMAIL,
        CYPRESS_PASSWORD: PASSWORD,
        MONGODB_URI: uri,
      },
    });
    child.on('exit', (code) => {
      if (code === 0) resolveOk();
      else reject(new Error(`cypress exited with ${code}`));
    });
  });
}

main().catch(async (err) => {
  console.error('[orchestrator]', err);
  await cleanup(1);
});
