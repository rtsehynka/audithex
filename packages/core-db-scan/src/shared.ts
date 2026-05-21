import type {
  Finding,
  OwaspLLMCategory,
  RuleDocument,
  RulesPack,
  SecretPatternEntry,
  Severity,
} from '@audithex/core-types';

/**
 * Pre-compiled secret-pattern rule. `scanDatabase` builds this index
 * once per run and reuses it across every table / collection.
 */
export interface SecretRule {
  rule: RuleDocument;
  pattern: SecretPatternEntry;
  compiled: RegExp;
}

/**
 * Walks the rules pack, picks rules whose engine reads regex bundles
 * (regex-in-code / regex-in-prompt), resolves each rule's
 * patternBundle id, and emits one SecretRule per (rule × pattern) pair
 * — that way one pattern match becomes one finding with the right
 * provider + patternId interpolated into the message params.
 *
 * Uncompilable regex entries are silently dropped: they would never
 * have matched at scan time anyway, and crashing the whole run for
 * one bad pattern is worse than skipping it.
 */
export function indexSecretRules(pack: RulesPack): SecretRule[] {
  const bundles = new Map(pack.patternBundles.map((b) => [b._id, b]));
  const out: SecretRule[] = [];
  for (const rule of pack.rules) {
    if (rule.enabled === false) continue;
    if (rule.engine !== 'regex-in-code' && rule.engine !== 'regex-in-prompt') continue;
    const bundleId = (rule.params as { patternBundle?: string }).patternBundle;
    if (!bundleId) continue;
    const bundle = bundles.get(bundleId);
    if (!bundle) continue;
    if (bundle.kind !== 'secret-patterns') continue;
    for (const entry of bundle.entries) {
      try {
        out.push({ rule, pattern: entry, compiled: new RegExp(entry.regex) });
      } catch {
        // skip uncompilable patterns — they'd never have matched anyway.
      }
    }
  }
  return out;
}

/**
 * Runs every secret-rule regex against `value` and pushes one Finding
 * per match into `out`. The synthetic `location.file` string is what
 * the report / persistence layer treats as the row pointer — it never
 * gets opened as a real path.
 */
export function matchValueIntoFindings(args: {
  value: string;
  rules: readonly SecretRule[];
  locationFile: string;
  /** Used as `Finding.location.line` — 1-based row / document index. */
  positionIndex: number;
  out: Finding[];
}): void {
  if (args.value.length === 0) return;
  for (const sr of args.rules) {
    const match = sr.compiled.exec(args.value);
    if (!match) continue;
    args.out.push({
      kind: 'static',
      ruleId: sr.rule._id,
      severity: sr.rule.severity as Severity,
      owasp: [...sr.rule.owasp] as OwaspLLMCategory[],
      ...(sr.rule.cwe ? { cwe: sr.rule.cwe } : {}),
      blockId: sr.rule.block,
      location: {
        file: args.locationFile,
        line: args.positionIndex,
        column: 1,
      },
      messageKey: sr.rule.messageKey,
      messageParams: {
        provider: sr.pattern.provider,
        patternId: sr.pattern.id,
      },
      rationaleKey: sr.rule.rationaleKey,
      fixKey: sr.rule.fixKey,
    });
  }
}

/** Extract a `database` label from a connection URI for the synthetic
 *  `db://<label>/...` location string. Falls back to the hostname. */
export function safeUriDatabase(uri: string): string {
  try {
    const u = new URL(uri);
    const path = u.pathname.replace(/^\/+/, '');
    return path || u.hostname;
  } catch {
    return 'database';
  }
}
