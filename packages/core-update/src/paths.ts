import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Returns the per-user audithex root. AUDITHEX_HOME overrides for tests
 * and locked-down CI runners.
 */
export function audithexHome(): string {
  if (process.env.AUDITHEX_HOME) return process.env.AUDITHEX_HOME;
  return join(homedir(), '.audithex');
}

export function rulesPackRoot(home: string = audithexHome()): string {
  return join(home, 'rules-pack');
}

/**
 * Working tree where the currently-active rules-pack lives. The runner
 * clones a remote into this path on first install and `git pull --ff-only`s
 * it on subsequent updates. loadRulesPack() reads from here directly.
 */
export function currentPackPath(home: string = audithexHome()): string {
  return join(rulesPackRoot(home), 'current');
}
