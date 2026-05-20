import { type ExecFileSyncOptions, execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Shared end-to-end runner used by every CLI integration test in this
 * workspace. Spawns the built audithex binary so the tests cover the
 * same code path real users hit (script entry, env loading, commander
 * dispatch, exit-code propagation).
 */

export function locateCliEntry(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/test-helpers/ -> src/ -> cli/ -> apps/ -> repo root
  const repoRoot = resolve(here, '..', '..', '..', '..');
  return join(repoRoot, 'apps', 'cli', 'bin', 'audithex.js');
}

export function locateFixturesRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '..', '..', '..', '..');
  return join(repoRoot, 'fixtures');
}

export interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

export function runCli(args: readonly string[], env?: NodeJS.ProcessEnv): RunResult {
  const opts: ExecFileSyncOptions = {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...(env ? { env } : {}),
  };
  try {
    const stdout = execFileSync('node', [locateCliEntry(), ...args], opts);
    return { status: 0, stdout: String(stdout), stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      status: typeof e.status === 'number' ? e.status : 1,
      stdout: e.stdout ? String(e.stdout) : '',
      stderr: e.stderr ? String(e.stderr) : '',
    };
  }
}
