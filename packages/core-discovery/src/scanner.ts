import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { getLanguageForFile, isScannableFile } from '@audithex/core-languages';
import type { DiscoveryArtifact, DiscoveryResult, DiscoverySummary } from '@audithex/core-types';
import { BUILTIN_EXTRACTORS, type Extractor } from './extractors/index.js';

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
  /**
   * Override the extractor pipeline. Defaults to BUILTIN_EXTRACTORS.
   * Pass an empty array to skip artifact extraction entirely (useful
   * for fast file-counting smoke tests).
   */
  extractors?: readonly Extractor[];
  /**
   * Skip reading any file larger than this many bytes. Defaults to
   * 1 MiB — enough for prompts and most source files, fast enough to
   * keep large-repo scans well under the week-2 budget.
   */
  maxFileSizeBytes?: number;
}

const DEFAULT_MAX_FILE_SIZE = 1024 * 1024;

/**
 * Directories always skipped regardless of `.gitignore` contents.
 * These are conventional build / dependency / cache dirs that no audit
 * needs to descend into.
 */
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
  '.venv',
  'venv',
  '__pycache__',
  'vendor',
  'target',
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

  const collectedFiles: string[] = [];
  let envFiles = 0;
  let skippedByGitignore = 0;

  const stack: string[] = [root];
  while (stack.length > 0) {
    if (collectedFiles.length >= maxFiles) break;
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
        collectedFiles.push(relPosix);
        continue;
      }

      // Central registry decides whether this extension is in scope.
      if (isScannableFile(entry)) {
        collectedFiles.push(relPosix);
      }
    }
  }

  const byExtension = classifyByExtension(collectedFiles);

  const extractors = options.extractors ?? BUILTIN_EXTRACTORS;
  const maxFileSize = options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE;
  const artifacts: DiscoveryArtifact[] = [];

  if (extractors.length > 0) {
    for (const rel of collectedFiles) {
      const language = getLanguageForFile(rel);
      if (!language) continue;
      const absolute = join(root, rel);
      try {
        const stat = statSync(absolute);
        if (stat.size > maxFileSize) continue;
      } catch {
        continue;
      }
      let content: string;
      try {
        content = readFileSync(absolute, 'utf8');
      } catch {
        continue;
      }
      const ext = extensionOf(rel);
      const input = {
        rootPath: root,
        relPath: rel,
        extension: ext,
        content,
        language,
      };
      for (const extractor of extractors) {
        artifacts.push(...extractor.extract(input));
      }
    }
  }

  const summary: DiscoverySummary = {
    totalFiles: collectedFiles.length,
    byExtension,
    envFiles,
    skippedByGitignore,
    elapsedMs: Date.now() - startedAt,
  };

  return {
    rootPath: root,
    scannedAt: new Date().toISOString(),
    summary,
    files: collectedFiles,
    artifacts,
  };
}
