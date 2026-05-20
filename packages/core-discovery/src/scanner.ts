import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import type { DiscoveryResult, DiscoverySummary } from '@audithex/core-types';

interface IgnoreInstance {
  add(content: string): IgnoreInstance;
  ignores(path: string): boolean;
}
type IgnoreFactory = () => IgnoreInstance;

const localRequire = createRequire(import.meta.url);
const createIgnore = localRequire('ignore') as IgnoreFactory;

export interface DiscoverOptions {
  rootPath: string;
  followSymlinks?: boolean;
  maxFiles?: number;
}

const ALWAYS_IGNORE = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'out',
  '.turbo',
  'coverage',
  '.vitest-cache',
  '.svelte-kit',
  '.cache',
]);

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.txt',
  '.yaml',
  '.yml',
]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === 0) return '';
  return name.slice(dot).toLowerCase();
}

function looksLikeEnvFile(name: string): boolean {
  return name === '.env' || name.startsWith('.env.');
}

function loadGitignore(rootPath: string): IgnoreInstance {
  const ig = createIgnore();
  try {
    const content = readFileSync(join(rootPath, '.gitignore'), 'utf8');
    ig.add(content);
  } catch {
    // no .gitignore — ok
  }
  return ig;
}

export function classifyByExtension(files: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of files) {
    const ext = extensionOf(file);
    if (!ext) continue;
    counts[ext] = (counts[ext] ?? 0) + 1;
  }
  return counts;
}

export function discover(options: DiscoverOptions): DiscoveryResult {
  const root = resolve(options.rootPath);
  const stats = statSync(root);
  if (!stats.isDirectory()) {
    throw new Error(`Discovery root is not a directory: ${root}`);
  }
  const gitignore = loadGitignore(root);
  const maxFiles = options.maxFiles ?? Number.POSITIVE_INFINITY;
  const startedAt = Date.now();

  const allFiles: string[] = [];
  let envFiles = 0;
  let skippedByGitignore = 0;

  const stack: string[] = [root];
  while (stack.length > 0) {
    if (allFiles.length >= maxFiles) break;
    const current = stack.pop();
    if (!current) break;

    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (ALWAYS_IGNORE.has(entry)) continue;
      const full = join(current, entry);
      const rel = relative(root, full);
      if (rel === '' || rel === '.') continue;

      // Normalize to forward slashes for the `ignore` package
      const relPosix = rel.split(sep).join('/');

      let entryStat: ReturnType<typeof statSync>;
      try {
        entryStat = options.followSymlinks ? statSync(full) : statSync(full);
      } catch {
        continue;
      }

      if (entryStat.isDirectory()) {
        if (gitignore.ignores(`${relPosix}/`)) {
          skippedByGitignore += 1;
          continue;
        }
        stack.push(full);
        continue;
      }

      if (!entryStat.isFile()) continue;
      if (gitignore.ignores(relPosix)) {
        skippedByGitignore += 1;
        continue;
      }

      if (looksLikeEnvFile(entry)) {
        envFiles += 1;
        allFiles.push(relPosix);
        continue;
      }

      const ext = extensionOf(entry);
      if (TEXT_EXTENSIONS.has(ext)) {
        allFiles.push(relPosix);
      }
    }
  }

  const byExtension = classifyByExtension(allFiles);

  const summary: DiscoverySummary = {
    totalFiles: allFiles.length,
    byExtension,
    envFiles,
    skippedByGitignore,
    elapsedMs: Date.now() - startedAt,
  };

  return {
    rootPath: root,
    scannedAt: new Date().toISOString(),
    summary,
    artifacts: [],
  };
}
