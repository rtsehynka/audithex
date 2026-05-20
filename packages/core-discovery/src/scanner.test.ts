import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { classifyByExtension, discover } from './scanner.js';

let workDir: string;

function makeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'audithex-discovery-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'node_modules', 'lodash'), { recursive: true });
  mkdirSync(join(root, 'build'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });

  writeFileSync(join(root, 'src', 'agent.ts'), 'export const x = 1;\n');
  writeFileSync(join(root, 'src', 'index.js'), 'console.log("hi");\n');
  writeFileSync(join(root, 'docs', 'README.md'), '# Hi\n');
  writeFileSync(join(root, 'package.json'), '{"name":"test"}\n');
  writeFileSync(join(root, '.env'), 'SECRET=1\n');
  writeFileSync(join(root, '.env.production'), 'SECRET=2\n');
  writeFileSync(join(root, 'node_modules', 'lodash', 'index.js'), 'noop\n');
  writeFileSync(join(root, 'build', 'out.js'), 'noop\n');
  writeFileSync(join(root, '.gitignore'), 'ignored.ts\n');
  writeFileSync(join(root, 'ignored.ts'), 'export {};\n');
  return root;
}

describe('discover', () => {
  beforeEach(() => {
    workDir = makeFixture();
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('walks the directory and counts files by extension', () => {
    const result = discover({ rootPath: workDir });
    expect(result.summary.totalFiles).toBeGreaterThan(0);
    expect(result.summary.byExtension['.ts']).toBe(1);
    expect(result.summary.byExtension['.js']).toBe(1);
    expect(result.summary.byExtension['.md']).toBe(1);
    expect(result.summary.byExtension['.json']).toBe(1);
  });

  it('counts .env files', () => {
    const result = discover({ rootPath: workDir });
    expect(result.summary.envFiles).toBe(2);
  });

  it('skips node_modules and build directories', () => {
    const result = discover({ rootPath: workDir });
    expect(result.summary.byExtension['.js']).toBe(1);
  });

  it('respects .gitignore patterns', () => {
    const result = discover({ rootPath: workDir });
    expect(result.summary.skippedByGitignore).toBeGreaterThanOrEqual(1);
  });

  it('throws when the root is not a directory', () => {
    expect(() => discover({ rootPath: join(workDir, 'package.json') })).toThrow();
  });
});

describe('classifyByExtension', () => {
  it('counts extensions case-insensitively', () => {
    const counts = classifyByExtension(['a.TS', 'b.ts', 'c.js']);
    expect(counts['.ts']).toBe(2);
    expect(counts['.js']).toBe(1);
  });

  it('ignores files without extensions', () => {
    const counts = classifyByExtension(['LICENSE', 'README']);
    expect(counts).toEqual({});
  });
});
