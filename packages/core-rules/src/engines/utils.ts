import type { SecretPatternEntry } from '@audithex/core-types';

/**
 * Shared helpers for rule engines. Anything that more than one engine
 * needs lives here so the engines themselves stay focused on dispatch.
 */

/**
 * Returns true if the pattern entry's tags intersect the rule's
 * whitelist. Used by every engine that loads a bundled pattern
 * collection — pattern selection logic must live in exactly one place.
 */
export function patternMatchesTagWhitelist(
  entry: SecretPatternEntry,
  whitelist: readonly string[] | undefined,
): boolean {
  if (!whitelist || whitelist.length === 0) return true;
  if (!entry.tags || entry.tags.length === 0) return false;
  for (const tag of entry.tags) {
    if (whitelist.includes(tag)) return true;
  }
  return false;
}

/**
 * Compiles a regex source string with the global flag. Returns null on
 * a malformed pattern so engines can skip it gracefully.
 */
export function safeCompileRegex(source: string, flags = 'g'): RegExp | null {
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}
