import type { DiscoveryResult, Finding, PatternBundle, RuleDocument } from '@audithex/core-types';

/**
 * Context passed to every engine when it evaluates a rule.
 * The set of pattern bundles is resolved by the loader and shared
 * across all rules so a regex bundle is parsed at most once per scan.
 */
export interface EngineContext {
  discovery: DiscoveryResult;
  patternBundles: ReadonlyMap<string, PatternBundle>;
}

export interface RuleEngine {
  kind: RuleDocument['engine'];
  evaluate(rule: RuleDocument, ctx: EngineContext): Finding[];
}
