#!/usr/bin/env node
/**
 * Rule #3 enforcement: docs/ must not contain `TODO:` placeholders.
 * Exits with code 1 on any match. Used in CI.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const docsRoot = new URL('../docs', import.meta.url).pathname;
const violations = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
    } else if (entry.endsWith('.md') || entry.endsWith('.mdx')) {
      const content = readFileSync(full, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (/\bTODO:/.test(line)) {
          violations.push({ file: full, line: index + 1, text: line.trim() });
        }
      });
    }
  }
}

walk(docsRoot);

if (violations.length === 0) {
  console.log('docs/ check passed: no TODO: placeholders found.');
  process.exit(0);
}

console.error(`docs/ check failed: ${violations.length} TODO: placeholder(s) found.`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.text}`);
}
process.exit(1);
