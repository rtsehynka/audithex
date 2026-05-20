import type { DiscoveryResult, Finding, Rule } from '@audithex/core-types';
import { allRules } from './rules/index.js';

export { allRules } from './rules/index.js';

export interface RuleEngineOptions {
  rules?: readonly Rule[];
}

export function runRules(discovery: DiscoveryResult, options: RuleEngineOptions = {}): Finding[] {
  const rules = options.rules ?? allRules;
  const findings: Finding[] = [];
  for (const rule of rules) {
    for (const finding of rule.check(discovery)) {
      findings.push(finding);
    }
  }
  return findings;
}
