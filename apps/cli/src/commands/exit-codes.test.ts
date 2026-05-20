import { type ExecFileSyncOptions, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * End-to-end exit-code coverage for the CLI. Spawns the built binary
 * with execFileSync so we exercise the same process boundary CI users
 * see. Each case asserts the documented contract:
 *   0 — no findings
 *   1 — only low / medium findings  (no fixture path covers this yet)
 *   2 — at least one high / critical finding, OR a CLI / environment error
 */

function locateCliEntry(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/commands/ -> src/ -> cli/ -> apps/ -> repo root
  const repoRoot = resolve(here, '..', '..', '..', '..');
  return join(repoRoot, 'apps', 'cli', 'bin', 'audithex.js');
}

function locateFixturesRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '..', '..', '..', '..');
  return join(repoRoot, 'fixtures');
}

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runCli(args: readonly string[], cwd?: string): RunResult {
  const opts: ExecFileSyncOptions = {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  };
  if (cwd) opts.cwd = cwd;
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

describe('CLI exit codes', () => {
  let cleanProject: string;

  beforeEach(() => {
    cleanProject = mkdtempSync(join(tmpdir(), 'audithex-clean-'));
    mkdirSync(join(cleanProject, 'src'), { recursive: true });
    writeFileSync(
      join(cleanProject, 'src', 'safe.ts'),
      'export function safe(x: number): number {\n  return x + 1;\n}\n',
      'utf8',
    );
  });

  afterEach(() => {
    rmSync(cleanProject, { recursive: true, force: true });
  });

  it('exits 0 on --help', () => {
    const result = runCli(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/scan/);
  });

  it('exits 0 on version', () => {
    const result = runCli(['version']);
    expect(result.status).toBe(0);
  });

  it('exits 0 when scan finds nothing', () => {
    const result = runCli(['scan', cleanProject]);
    expect(result.status).toBe(0);
  });

  it('exits 2 when scan finds critical findings (banking-bot fixture)', () => {
    const fixture = join(locateFixturesRoot(), 'fixture-banking-bot');
    const result = runCli(['scan', fixture]);
    expect(result.status).toBe(2);
    expect(result.stdout).toMatch(/Critical/i);
  });

  it('selftest exits 0 against bundled fixtures', () => {
    const result = runCli(['selftest']);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/PASS/);
  });

  it('exits 2 on an unknown --report value', () => {
    const result = runCli(['scan', cleanProject, '--report', 'nope']);
    expect(result.status).toBe(2);
  });
});
