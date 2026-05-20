#!/usr/bin/env node
/**
 * Rule #1 enforcement: source code must not contain `not implemented` stubs.
 *
 * Scans:
 *  - apps/**\/src/**\/*.ts
 *  - packages/**\/src/**\/*.ts
 *
 * Fails on any of the following patterns (case-insensitive):
 *  - throw new Error('not implemented')
 *  - throw new Error("not implemented")
 *  - throw new TypeError('not implemented')
 *  - // not implemented
 *  - TODO: implement
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = [
  /throw\s+new\s+\w*Error\s*\(\s*['"`][^'"`]*not\s+implemented[^'"`]*['"`]/i,
  /\/\/\s*not\s+implemented/i,
  /TODO:\s*implement/i,
];

const SOURCE_ROOTS = ['apps', 'packages'];
const violations = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      const content = readFileSync(full, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        for (const pattern of FORBIDDEN) {
          if (pattern.test(line)) {
            violations.push({ file: full, line: index + 1, text: line.trim() });
          }
        }
      });
    }
  }
}

const repoRoot = new URL('..', import.meta.url).pathname;
for (const root of SOURCE_ROOTS) {
  walk(join(repoRoot, root));
}

if (violations.length === 0) {
  console.log('no-stubs check passed.');
  process.exit(0);
}

console.error(`no-stubs check failed: ${violations.length} placeholder(s) found.`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.text}`);
}
process.exit(1);
