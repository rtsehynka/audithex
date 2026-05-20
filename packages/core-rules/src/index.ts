import type {
  DiscoveryResult,
  Finding,
  PatternBundle,
  RuleDocument,
  RulesPack,
} from '@audithex/core-types';
import { getEngine } from './engines/index.js';
import { loadBundledRulesPack } from './loader.js';

export { getEngine, knownEngines } from './engines/index.js';
export type { EngineContext, RuleEngine } from './engines/index.js';
export {
  bundledRulesPackPath,
  loadBundledRulesPack,
  loadRulesPack,
} from './loader.js';
export type { LoadRulesPackOptions } from './loader.js';

export interface RunRulesOptions {
  /** When omitted, the bundled rules-pack is loaded automatically. */
  rulesPack?: RulesPack;
  /** Subset of rule ids to run; default = all enabled rules in the pack. */
  ruleIds?: readonly string[];
}

export function runRules(discovery: DiscoveryResult, options: RunRulesOptions = {}): Finding[] {
  const pack = options.rulesPack ?? loadBundledRulesPack();
  const bundleIndex: ReadonlyMap<string, PatternBundle> = new Map(
    pack.patternBundles.map((b) => [b._id, b]),
  );
  const filter = options.ruleIds ? new Set(options.ruleIds) : null;
  const findings: Finding[] = [];

  for (const rule of pack.rules) {
    if (rule.enabled === false) continue;
    if (filter && !filter.has(rule._id)) continue;
    const engine = getEngine(rule.engine);
    if (!engine) continue;
    findings.push(...engine.evaluate(rule, { discovery, patternBundles: bundleIndex }));
  }
  return findings;
}

export function listBundledRules(): readonly RuleDocument[] {
  return loadBundledRulesPack().rules;
}
