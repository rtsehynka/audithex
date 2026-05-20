import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  PatternBundle,
  RuleDocument,
  RulesPack,
  RulesPackManifest,
} from '@audithex/core-types';

/**
 * Locates the bundled rules-pack directory next to the package source.
 * Works both in development (dist/ next to src/) and in published
 * builds where `rules-pack/` is listed in package.json `files`.
 */
function resolveBundledRulesPackRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    const candidate = resolve(current, 'rules-pack');
    try {
      if (statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      // walk up
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error('Audithex bundled rules-pack directory not found.');
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function listJsonFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.filter((name) => name.endsWith('.json')).sort();
}

function readPack(rootPath: string, source: 'bundled' | 'user'): RulesPack {
  const manifest = readJson<RulesPackManifest>(join(rootPath, 'manifest.json'));

  const rulesDir = join(rootPath, 'rules');
  const rules: RuleDocument[] = [];
  for (const file of listJsonFiles(rulesDir)) {
    rules.push(readJson<RuleDocument>(join(rulesDir, file)));
  }

  const patternsDir = join(rootPath, 'patterns');
  const patternBundles: PatternBundle[] = [];
  for (const file of listJsonFiles(patternsDir)) {
    patternBundles.push(readJson<PatternBundle>(join(patternsDir, file)));
  }

  return {
    manifest,
    rules,
    patternBundles,
    source,
    rootPath,
  };
}

export interface LoadRulesPackOptions {
  /** When set, overrides the user override directory (`~/.audithex/rules-pack/current/`). */
  userRulesPackDir?: string;
  /** Force loading the bundled pack regardless of user dir presence. */
  preferBundled?: boolean;
}

export function bundledRulesPackPath(): string {
  return resolveBundledRulesPackRoot();
}

export function loadBundledRulesPack(): RulesPack {
  return readPack(resolveBundledRulesPackRoot(), 'bundled');
}

export function loadRulesPack(options: LoadRulesPackOptions = {}): RulesPack {
  if (!options.preferBundled && options.userRulesPackDir) {
    try {
      const stat = statSync(join(options.userRulesPackDir, 'manifest.json'));
      if (stat.isFile()) {
        return readPack(options.userRulesPackDir, 'user');
      }
    } catch {
      // fall through to bundled
    }
  }
  return loadBundledRulesPack();
}
