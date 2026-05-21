#!/usr/bin/env node
/**
 * Tiny `next dev` / `next start` launcher that probes for the first
 * free TCP port instead of hard-pinning one. The preferred port comes
 * from PORT (or AUDITHEX_DEV_PORT_START); when busy we step up until
 * we find one that binds. This is what keeps `yarn dev` from blowing
 * up when another project on the same machine already owns 3000/3001.
 *
 * Usage:
 *   node scripts/serve.mjs dev     # → next dev   on the first free port
 *   node scripts/serve.mjs start   # → next start on the first free port
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, '..');
const repoRoot = resolve(webDir, '..', '..');

// Next.js loads .env from its own project directory (apps/web/). The
// monorepo convention puts shared secrets in the repo-root .env so the
// CLI + the web UI read the same file. We shim it through to Next by
// preloading the root .env into process.env before spawning the
// server. Existing values are NOT overridden — process env wins.
loadDotenvFile(resolve(repoRoot, '.env'));

const mode = process.argv[2];
if (mode !== 'dev' && mode !== 'start') {
  console.error('usage: node scripts/serve.mjs <dev|start>');
  process.exit(2);
}

function loadDotenvFile(path) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const PREFERRED = Number(process.env.PORT ?? process.env.AUDITHEX_DEV_PORT_START ?? 3001);
const MAX_TRIES = 20;

function probeAt(port, host) {
  return new Promise((resolveOk) => {
    const server = createServer();
    server.once('error', () => resolveOk(false));
    server.once('listening', () => {
      server.close(() => resolveOk(true));
    });
    server.listen(port, host);
  });
}

/**
 * Returns true iff the port binds successfully on BOTH IPv4 and IPv6.
 * Next.js dev binds dual-stack; if anything else owns the v6 socket on
 * this port we will collide at runtime even though v4 looks free.
 */
async function probePort(port) {
  if (!(await probeAt(port, '0.0.0.0'))) return false;
  if (!(await probeAt(port, '::'))) return false;
  return true;
}

async function findFreePort() {
  for (let i = 0; i < MAX_TRIES; i += 1) {
    const candidate = PREFERRED + i;
    // The probe can occasionally race a process that releases its
    // socket just as we test it; that's fine — `next` will then
    // error and the user re-runs. We optimise for the common case.
    // eslint-disable-next-line no-await-in-loop
    if (await probePort(candidate)) return candidate;
  }
  throw new Error(
    `No free port found in range ${PREFERRED}..${PREFERRED + MAX_TRIES - 1}. Close another dev server or set PORT to a different starting point.`,
  );
}

function locateNextBin() {
  const candidates = [
    resolve(webDir, 'node_modules', '.bin', 'next'),
    resolve(repoRoot, 'node_modules', '.bin', 'next'),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error('next binary not found in apps/web or repo-root node_modules');
}

const port = await findFreePort();
const nextBin = locateNextBin();
console.log(
  `[audithex/web] starting next ${mode} on http://localhost:${port}${
    port !== PREFERRED ? ` (${PREFERRED} was busy)` : ''
  }`,
);

const child = spawn(nextBin, [mode, '--port', String(port)], {
  cwd: webDir,
  stdio: 'inherit',
});

const forward = (signal) => () => child.kill(signal);
process.on('SIGINT', forward('SIGINT'));
process.on('SIGTERM', forward('SIGTERM'));
process.on('SIGHUP', forward('SIGHUP'));

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
