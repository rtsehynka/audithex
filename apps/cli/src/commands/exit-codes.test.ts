import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locateFixturesRoot, runCli } from '../test-helpers/cli-runner.js';

/**
 * End-to-end exit-code coverage. Each case asserts the documented
 * contract:
 *   0 — no findings
 *   1 — only low / medium findings  (no fixture covers this yet)
 *   2 — at least one high / critical finding, OR a CLI / env error
 */

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
