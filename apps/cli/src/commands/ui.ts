import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { t } from '@audithex/core-i18n';
import type { Command } from 'commander';
import type { AudithexEnv } from '../env.js';

interface UiCommandOptions {
  port?: string;
  dev?: boolean;
  open?: boolean;
}

const DEFAULT_PORT = 7777;

export function registerUiCommand(program: Command, env: AudithexEnv): void {
  program
    .command('ui')
    .description(t('cli:commands.ui.summary'))
    .option('-p, --port <port>', t('ui:flags.port'), String(DEFAULT_PORT))
    .option('--dev', t('ui:flags.dev'), false)
    .option('--no-open', t('ui:flags.noOpen'))
    .action((options: UiCommandOptions) => {
      const port = parsePort(options.port);
      if (!env.MONGODB_URI) {
        process.stderr.write(`${t('ui:mongoMissing')}\n`);
        process.exitCode = 2;
        return;
      }
      if (!env.AUDITHEX_UI_SESSION_SECRET) {
        process.stderr.write(`${t('ui:sessionSecretMissing')}\n`);
        process.exitCode = 2;
        return;
      }

      const webDir = resolveWebDir();
      if (!existsSync(webDir)) {
        process.stderr.write(`${t('ui:webMissing', { path: webDir })}\n`);
        process.exitCode = 2;
        return;
      }

      const dev = options.dev === true;
      const nextBin = resolveNextBin(webDir);
      if (!nextBin) {
        process.stderr.write(`${t('ui:nextMissing')}\n`);
        process.exitCode = 2;
        return;
      }
      if (!dev && !existsSync(resolve(webDir, '.next'))) {
        process.stderr.write(`${t('ui:notBuilt')}\n`);
        process.exitCode = 2;
        return;
      }

      const subEnv: NodeJS.ProcessEnv = {
        ...process.env,
        MONGODB_URI: env.MONGODB_URI,
        AUDITHEX_UI_SESSION_SECRET: env.AUDITHEX_UI_SESSION_SECRET,
      };

      const args = dev ? ['dev', '--port', String(port)] : ['start', '--port', String(port)];
      const child = spawn(nextBin, args, {
        cwd: webDir,
        env: subEnv,
        stdio: 'inherit',
      });

      const url = `http://localhost:${port}`;
      process.stdout.write(`${t('ui:starting', { url, mode: dev ? 'dev' : 'start' })}\n`);

      if (options.open !== false) tryOpen(url);

      const forward = (signal: NodeJS.Signals): void => {
        if (!child.killed) child.kill(signal);
      };
      process.on('SIGINT', () => forward('SIGINT'));
      process.on('SIGTERM', () => forward('SIGTERM'));

      child.on('exit', (code, signal) => {
        if (signal) {
          process.stdout.write(`${t('ui:stopped', { reason: signal })}\n`);
          process.exitCode = 0;
          return;
        }
        process.exitCode = code ?? 0;
      });
    });
}

function parsePort(raw: string | undefined): number {
  if (!raw) return DEFAULT_PORT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 65_535) return DEFAULT_PORT;
  return n;
}

function resolveWebDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/commands/ or src/commands/ -> apps/cli/ -> apps/ -> repo root
  const repoRoot = resolve(here, '..', '..', '..', '..');
  return resolve(repoRoot, 'apps', 'web');
}

function resolveNextBin(webDir: string): string | null {
  const repoRoot = resolve(webDir, '..', '..');
  const candidates = [
    resolve(webDir, 'node_modules', '.bin', 'next'),
    resolve(repoRoot, 'node_modules', '.bin', 'next'),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function tryOpen(url: string): void {
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(opener, [url], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // Opening the browser is a convenience, not a requirement.
  }
}

const _testHooks = { parsePort, resolveWebDir };
export const __test = _testHooks;
