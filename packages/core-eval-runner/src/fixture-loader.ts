import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExpectedFixture } from './index.js';

export interface LoadedFixture {
  /** Directory name under `fixtures/`. */
  name: string;
  /** Absolute path to the fixture root (the directory passed to discover()). */
  rootPath: string;
  /** Parsed ground-truth document. */
  expected: ExpectedFixture;
}

/**
 * Locates the bundled `fixtures/` directory by walking up from this
 * file's location. Mirrors the resolver in `core-rules/src/loader.ts`
 * so the development checkout and a published install both work.
 */
export function bundledFixturesRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i += 1) {
    const candidate = resolve(current, 'fixtures');
    try {
      if (statSync(candidate).isDirectory()) return candidate;
    } catch {
      // walk up
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error('Audithex bundled fixtures/ directory not found.');
}

export function loadFixture(
  name: string,
  fixturesRoot: string = bundledFixturesRoot(),
): LoadedFixture {
  const rootPath = join(fixturesRoot, name);
  const expectedPath = join(rootPath, 'expected-findings.json');
  const raw = readFileSync(expectedPath, 'utf8');
  const expected = JSON.parse(raw) as ExpectedFixture;
  if (expected.fixture !== name) {
    throw new Error(
      `fixture '${name}' has mismatched 'fixture' field '${expected.fixture}' in expected-findings.json`,
    );
  }
  return { name, rootPath, expected };
}

export function listAvailableFixtures(fixturesRoot: string = bundledFixturesRoot()): string[] {
  let entries: string[];
  try {
    entries = readdirSync(fixturesRoot);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(fixturesRoot, entry);
    try {
      if (!statSync(full).isDirectory()) continue;
      statSync(join(full, 'expected-findings.json'));
      out.push(entry);
    } catch {
      // not a fixture directory
    }
  }
  return out.sort();
}
