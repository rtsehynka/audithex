import type {
  DiscoveryResult,
  Finding,
  PatternBundle,
  RuleDocument,
  RulesPack,
  Severity,
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

export interface RuleProgressEvent {
  ruleId: string;
  findings: readonly Finding[];
  /** 1-based position in the rules-list (after disabled rules are skipped). */
  index: number;
  /** Total number of rules that will be evaluated for this run. */
  total: number;
}

export interface RunRulesOptions {
  /** When omitted, the bundled rules-pack is loaded automatically. */
  rulesPack?: RulesPack;
  /** Subset of rule ids to run; default = all enabled rules in the pack. */
  ruleIds?: readonly string[];
  /**
   * Per-rule severity overrides. When a finding is produced for one of
   * these rule ids, the override replaces the rule's default severity
   * (in the finding only — the rule document is not mutated).
   */
  severityOverrides?: Readonly<Record<string, Severity>>;
  /**
   * Rule ids to skip entirely. Treated identically to `enabled: false`
   * on the rule document but lives outside the rules-pack so projects
   * can disable rules without forking the pack.
   */
  disabledRuleIds?: readonly string[];
  /**
   * Optional sync callback fired after each rule executes. Used by the
   * web UI's live scan stream to emit per-rule progress over SSE.
   * Throwing here aborts the run — runRules does not catch.
   */
  onRuleEvaluated?: (event: RuleProgressEvent) => void;
}

export function runRules(discovery: DiscoveryResult, options: RunRulesOptions = {}): Finding[] {
  const pack = options.rulesPack ?? loadBundledRulesPack();
  const bundleIndex: ReadonlyMap<string, PatternBundle> = new Map(
    pack.patternBundles.map((b) => [b._id, b]),
  );
  const filter = options.ruleIds ? new Set(options.ruleIds) : null;
  const disabled = options.disabledRuleIds ? new Set(options.disabledRuleIds) : null;
  const overrides = options.severityOverrides;
  const onProgress = options.onRuleEvaluated;
  const findings: Finding[] = [];

  const eligible = pack.rules.filter((rule) => {
    if (rule.enabled === false) return false;
    if (filter?.has(rule._id) === false) return false;
    if (disabled?.has(rule._id)) return false;
    return Boolean(getEngine(rule.engine));
  });

  for (let i = 0; i < eligible.length; i += 1) {
    const rule = eligible[i] as (typeof eligible)[number];
    const engine = getEngine(rule.engine);
    if (!engine) continue;
    const produced = engine.evaluate(rule, { discovery, patternBundles: bundleIndex });
    const override = overrides?.[rule._id];
    if (override) {
      for (const f of produced) f.severity = override;
    }
    findings.push(...produced);
    if (onProgress) {
      onProgress({ ruleId: rule._id, findings: produced, index: i + 1, total: eligible.length });
    }
  }
  return findings;
}

export function listBundledRules(): readonly RuleDocument[] {
  return loadBundledRulesPack().rules;
}
