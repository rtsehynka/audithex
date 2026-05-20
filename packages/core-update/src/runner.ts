import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { RulesPackManifest } from '@audithex/core-types';
import { audithexHome, currentPackPath, rulesPackRoot } from './paths.js';

/**
 * Default rules-pack channel: a public git repository whose layout
 * mirrors the bundled `rules-pack/` (manifest.json + rules/ + patterns/).
 * Users can point AUDITHEX_RULES_PACK_URL at any other git URL — a fork,
 * a private mirror, or a file:// path during development.
 */
export const DEFAULT_RULES_PACK_GIT_URL = 'https://github.com/audithex/rules-pack.git';

export type UpdateOutcome =
  | { kind: 'up-to-date'; commit: string }
  | { kind: 'installed'; from: string | null; to: string; manifestVersion: string }
  | { kind: 'fetch-failed'; error: string }
  | { kind: 'rolled-back'; from: string | null; attempted: string; reason: string };

export interface RunUpdateOptions {
  /** Per-user audithex root. Defaults to AUDITHEX_HOME or ~/.audithex. */
  home?: string;
  /** Git URL to clone/pull. Defaults to DEFAULT_RULES_PACK_GIT_URL. */
  rulesPackUrl?: string;
  /**
   * Selftest callback. Receives the working tree after pull. Returning
   * false (or throwing) triggers a `git reset --hard <previous-HEAD>`
   * for an existing checkout, or removal of the freshly cloned tree.
   */
  selftest?: (packDir: string) => Promise<boolean> | boolean;
  /**
   * Optional shell hook for tests / mock channels. When provided the
   * runner forwards every git invocation here instead of execFileSync.
   */
  gitRunner?: GitRunner;
}

export type GitRunner = (args: readonly string[], cwd?: string) => string;

const defaultGitRunner: GitRunner = (args, cwd) =>
  execFileSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

export async function runUpdate(options: RunUpdateOptions = {}): Promise<UpdateOutcome> {
  const home = options.home ?? audithexHome();
  const url = options.rulesPackUrl ?? DEFAULT_RULES_PACK_GIT_URL;
  const git = options.gitRunner ?? defaultGitRunner;
  const packDir = currentPackPath(home);

  const isExistingClone = existsSync(join(packDir, '.git'));

  let previousHead: string | null = null;
  if (isExistingClone) {
    try {
      previousHead = git(['rev-parse', 'HEAD'], packDir).trim();
    } catch (err) {
      return { kind: 'fetch-failed', error: `git rev-parse failed: ${messageOf(err)}` };
    }
    try {
      git(['fetch', '--prune', 'origin'], packDir);
      git(['pull', '--ff-only', 'origin', 'HEAD'], packDir);
    } catch (err) {
      return { kind: 'fetch-failed', error: messageOf(err) };
    }
  } else {
    mkdirSync(rulesPackRoot(home), { recursive: true });
    try {
      git(['clone', '--depth', '1', url, packDir]);
    } catch (err) {
      return { kind: 'fetch-failed', error: messageOf(err) };
    }
  }

  let newHead: string;
  try {
    newHead = git(['rev-parse', 'HEAD'], packDir).trim();
  } catch (err) {
    return { kind: 'fetch-failed', error: `git rev-parse failed: ${messageOf(err)}` };
  }

  if (previousHead !== null && previousHead === newHead) {
    return { kind: 'up-to-date', commit: newHead };
  }

  if (options.selftest) {
    let passed = false;
    try {
      passed = await options.selftest(packDir);
    } catch {
      passed = false;
    }
    if (!passed) {
      if (previousHead !== null) {
        try {
          git(['reset', '--hard', previousHead], packDir);
        } catch (err) {
          return {
            kind: 'rolled-back',
            from: previousHead,
            attempted: newHead,
            reason: `selftest failed; git reset to previous HEAD also failed: ${messageOf(err)}`,
          };
        }
      } else {
        // First-ever install — no previous state to roll back to. Wipe the clone.
        rmSync(packDir, { recursive: true, force: true });
      }
      return {
        kind: 'rolled-back',
        from: previousHead,
        attempted: newHead,
        reason: 'selftest failed on new pack',
      };
    }
  }

  let manifestVersion = 'unknown';
  try {
    const raw = readFileSync(join(packDir, 'manifest.json'), 'utf8');
    const parsed = JSON.parse(raw) as Partial<RulesPackManifest>;
    if (typeof parsed.version === 'string') manifestVersion = parsed.version;
  } catch {
    // manifest.json missing or malformed — still report installed; loader will surface the real error.
  }

  return {
    kind: 'installed',
    from: previousHead,
    to: newHead,
    manifestVersion,
  };
}

/**
 * Returns the abbreviated commit SHA the currently-active rules-pack
 * checkout is at, or null when no checkout exists. Used by the CLI to
 * print "current commit" without re-cloning.
 */
export function readCurrentCommit(home: string = audithexHome()): string | null {
  const packDir = currentPackPath(home);
  if (!existsSync(join(packDir, '.git'))) return null;
  try {
    return defaultGitRunner(['rev-parse', '--short', 'HEAD'], packDir).trim();
  } catch {
    return null;
  }
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
