#!/usr/bin/env node
/**
 * Rules #4 + #5 enforcement: every key in locales/en/<file>.json must exist
 * in every other locale (e.g. locales/uk/<file>.json) and vice versa.
 * Exits with code 1 on any mismatch.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const localesRoot = new URL('../locales', import.meta.url).pathname;

function listLocales() {
  return readdirSync(localesRoot).filter((entry) => {
    const full = join(localesRoot, entry);
    return statSync(full).isDirectory();
  });
}

function listNamespaces(locale) {
  const dir = join(localesRoot, locale);
  return readdirSync(dir).filter((entry) => entry.endsWith('.json'));
}

function flattenKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, next));
    } else {
      keys.push(next);
    }
  }
  return keys;
}

function loadNamespace(locale, namespace) {
  const full = join(localesRoot, locale, namespace);
  const json = JSON.parse(readFileSync(full, 'utf8'));
  return new Set(flattenKeys(json));
}

const locales = listLocales();
if (locales.length < 2) {
  console.log(`locale parity: only ${locales.length} locale(s), nothing to compare.`);
  process.exit(0);
}

const [reference, ...others] = locales;
const namespaces = listNamespaces(reference);
const errors = [];

for (const other of others) {
  for (const namespace of namespaces) {
    let refKeys;
    let otherKeys;
    try {
      refKeys = loadNamespace(reference, namespace);
    } catch (e) {
      errors.push(`Cannot load ${reference}/${namespace}: ${e.message}`);
      continue;
    }
    try {
      otherKeys = loadNamespace(other, namespace);
    } catch (e) {
      errors.push(`Cannot load ${other}/${namespace}: ${e.message}`);
      continue;
    }
    for (const key of refKeys) {
      if (!otherKeys.has(key)) {
        errors.push(`Missing in ${other}/${namespace}: ${key}`);
      }
    }
    for (const key of otherKeys) {
      if (!refKeys.has(key)) {
        errors.push(`Missing in ${reference}/${namespace}: ${key}`);
      }
    }
  }
}

if (errors.length === 0) {
  console.log(`locale parity passed across [${locales.join(', ')}].`);
  process.exit(0);
}

console.error(`locale parity failed: ${errors.length} mismatch(es).`);
for (const e of errors) {
  console.error(`  ${e}`);
}
process.exit(1);
