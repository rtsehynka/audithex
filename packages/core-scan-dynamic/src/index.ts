import type {
  DynamicFinding,
  OwaspLLMCategory,
  PayloadCategory,
  RuleDocument,
  RulesPack,
  Severity,
} from '@audithex/core-types';
import { type BudgetSnapshot, BudgetTracker } from './budget.js';
import { BudgetExceededError } from './errors.js';
import { type JudgeVerdict, judgeResponse, validateJudge } from './judges/index.js';
import { type AgentTarget, type TargetResponse, callTarget } from './target.js';

export { BudgetTracker } from './budget.js';
export type { BudgetReservation, BudgetSnapshot } from './budget.js';
export { type AgentTarget, type TargetResponse, callTarget } from './target.js';
export {
  type JudgeVerdict,
  type RefusalJudgeConfig,
  type JudgeSpec,
  SUPPORTED_JUDGE_TYPES,
  judgeRefusal,
  judgeResponse,
  validateJudge,
} from './judges/index.js';
export {
  BudgetExceededError,
  type DynamicScanErrorCode,
  DynamicScanError,
  RealAgentCallInCiError,
  TargetNetworkError,
  UnsupportedJudgeError,
} from './errors.js';

/**
 * Events the runner yields. The CLI / web SSE layers consume these to
 * drive live progress UI and to capture the final findings + budget
 * snapshot for persistence.
 */
export type DynamicScanEvent =
  | {
      kind: 'attack-started';
      ruleId: string;
      payloadCategory: PayloadCategory;
      index: number;
      total: number;
    }
  | {
      kind: 'attack-completed';
      ruleId: string;
      finding: DynamicFinding | null;
      tokensUsed?: { input: number; output: number };
      costUsd: number;
    }
  | {
      kind: 'budget-update';
      snapshot: BudgetSnapshot;
    }
  | {
      kind: 'dynamic-done';
      findings: readonly DynamicFinding[];
      budget: BudgetSnapshot;
    };

export interface RunDynamicAttackRulesOptions {
  rulesPack: RulesPack;
  target: AgentTarget;
  maxBudgetUsd: number;
  /** Block IDs to skip; identical semantics to RunRulesOptions.disabledBlockIds. */
  disabledBlockIds?: readonly string[];
  /** Rule IDs to skip; identical semantics to RunRulesOptions.disabledRuleIds. */
  disabledRuleIds?: readonly string[];
  /** Pre-charge per attack. Defaults to a conservative 0.005 USD. */
  perAttackReservationUsd?: number;
  /** Inject a stub fetch implementation in tests. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_PER_ATTACK_RESERVATION_USD = 0.005;

/**
 * Async generator that streams attack lifecycle events while the
 * dynamic scan runs. Driven by the rules pack (any rule with engine
 * === 'dynamic-attack') and a `target` describing the user's agent.
 *
 * Budget discipline:
 *  1. Reserves `perAttackReservationUsd` up-front before dispatching.
 *  2. After the response is back, computes the realised cost (zero
 *     when the provider does not report tokens) and commits, refunding
 *     any slack.
 *  3. Hard-stops on BudgetExceededError, marking the budget snapshot
 *     `exhausted` so callers can render an explicit "budget cap hit"
 *     message rather than a silent partial result.
 *
 * Network discipline lives in `callTarget` (SSRF + CI guard + timeout
 * + scheme allowlist + max-0 redirects).
 */
export async function* runDynamicAttackRules(
  options: RunDynamicAttackRulesOptions,
): AsyncGenerator<DynamicScanEvent, void, void> {
  const eligible = selectEligibleRules(options);
  const tracker = new BudgetTracker(options.maxBudgetUsd);
  const reservationUsd = options.perAttackReservationUsd ?? DEFAULT_PER_ATTACK_RESERVATION_USD;
  const findings: DynamicFinding[] = [];

  // Validate every judge before dispatching anything. A malformed
  // rule pack would otherwise burn budget on the first few attacks
  // before failing on a later judge.
  for (const rule of eligible) {
    validateJudge(rule);
  }

  for (let i = 0; i < eligible.length; i += 1) {
    const rule = eligible[i] as RuleDocument;
    const params = (rule.params ?? {}) as Record<string, unknown>;
    const payload = typeof params.payload === 'string' ? params.payload : '';
    const category = (
      typeof params.category === 'string' ? params.category : 'prompt_injection_direct'
    ) as PayloadCategory;

    yield {
      kind: 'attack-started',
      ruleId: rule._id,
      payloadCategory: category,
      index: i + 1,
      total: eligible.length,
    };

    let reservation: ReturnType<BudgetTracker['reserve']>;
    try {
      reservation = tracker.reserve(reservationUsd);
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        yield { kind: 'budget-update', snapshot: tracker.snapshot() };
        break;
      }
      throw err;
    }

    let response: TargetResponse;
    try {
      response = await callTarget(options.target, payload, options.fetchImpl);
    } catch (err) {
      // Network failure does not produce a finding (we did not learn
      // anything about the agent's actual behaviour) — refund the
      // reservation and continue with the next attack so a transient
      // hiccup does not poison the whole run.
      reservation.cancel();
      yield {
        kind: 'attack-completed',
        ruleId: rule._id,
        finding: null,
        costUsd: 0,
      };
      yield { kind: 'budget-update', snapshot: tracker.snapshot() };
      // Re-throw guard-class errors so the caller learns about config
      // problems immediately rather than seeing them buried in 10
      // identical attack-completed events.
      if (
        err instanceof Error &&
        (err.name === 'RealAgentCallInCiError' || err.name === 'TargetNetworkError')
      ) {
        throw err;
      }
      continue;
    }

    const realisedCost = estimateRealisedCost(response.tokensUsed);
    reservation.commit(realisedCost);

    const verdict: JudgeVerdict = judgeResponse(rule, response.content);
    const finding: DynamicFinding | null = verdict.triggered
      ? buildFinding(rule, category, payload, response, verdict, realisedCost)
      : null;
    if (finding) findings.push(finding);

    const completedEvent: DynamicScanEvent = {
      kind: 'attack-completed',
      ruleId: rule._id,
      finding,
      costUsd: realisedCost,
    };
    if (response.tokensUsed) {
      completedEvent.tokensUsed = response.tokensUsed;
    }
    yield completedEvent;
    yield { kind: 'budget-update', snapshot: tracker.snapshot() };
  }

  yield { kind: 'dynamic-done', findings, budget: tracker.snapshot() };
}

/**
 * Convenience wrapper that drains the generator and returns the
 * collected findings. Use this from non-streaming callers (tests, the
 * CLI's eventual `--no-stream` path) when live progress is not
 * required.
 */
export async function runDynamicAttackRulesCollect(
  options: RunDynamicAttackRulesOptions,
): Promise<{ findings: DynamicFinding[]; budget: BudgetSnapshot }> {
  const findings: DynamicFinding[] = [];
  let budget: BudgetSnapshot | null = null;
  for await (const event of runDynamicAttackRules(options)) {
    if (event.kind === 'dynamic-done') {
      findings.push(...event.findings);
      budget = event.budget;
    }
  }
  if (!budget) {
    // Defensive: the generator always yields a dynamic-done event
    // as its last step, but if it threw before that, surface a
    // synthetic snapshot so callers do not see undefined.
    budget = { maxUsd: options.maxBudgetUsd, spentUsd: 0, exhausted: false };
  }
  return { findings, budget };
}

function selectEligibleRules(options: RunDynamicAttackRulesOptions): readonly RuleDocument[] {
  const disabledBlocks = options.disabledBlockIds ? new Set(options.disabledBlockIds) : null;
  const disabledRules = options.disabledRuleIds ? new Set(options.disabledRuleIds) : null;
  return options.rulesPack.rules.filter((rule) => {
    if (rule.engine !== 'dynamic-attack') return false;
    if (rule.enabled === false) return false;
    if (disabledBlocks?.has(rule.block)) return false;
    if (disabledRules?.has(rule._id)) return false;
    return true;
  });
}

/**
 * Rough cost estimator until per-provider pricing tables ship. Returns
 * 0 when token usage is not reported (most self-hosted gateways), and
 * a conservative $5/M input + $15/M output blend otherwise — enough
 * to make the budget meter visibly tick without claiming precision we
 * don't have.
 */
function estimateRealisedCost(tokensUsed: TargetResponse['tokensUsed']): number {
  if (!tokensUsed) return 0;
  const inputCost = (tokensUsed.input / 1_000_000) * 5;
  const outputCost = (tokensUsed.output / 1_000_000) * 15;
  return inputCost + outputCost;
}

function buildFinding(
  rule: RuleDocument,
  category: PayloadCategory,
  prompt: string,
  response: TargetResponse,
  verdict: JudgeVerdict,
  costUsd: number,
): DynamicFinding {
  const finding: DynamicFinding = {
    kind: 'dynamic',
    ruleId: rule._id,
    severity: rule.severity as Severity,
    owasp: [...rule.owasp] as OwaspLLMCategory[],
    ...(rule.cwe ? { cwe: rule.cwe } : {}),
    blockId: rule.block,
    payloadId: rule._id,
    payloadCategory: category,
    prompt: truncate(prompt),
    response: truncate(response.content),
    judgeReason: verdict.reason,
    messageKey: rule.messageKey,
    rationaleKey: rule.rationaleKey,
    fixKey: rule.fixKey,
  };
  if (response.tokensUsed) {
    finding.tokensUsed = response.tokensUsed;
  }
  if (costUsd > 0) {
    finding.costUsd = costUsd;
  }
  return finding;
}

/**
 * Cap stored prompt / response at 2 KB each. Persisted dynamic
 * findings are seen by every collaborator with access to the scan
 * history; truncating bounds the leakage of any PII / secret an
 * attacker might have elicited from the agent. Pre-persist secret
 * scrubbing is a separate concern and lands with the persistence
 * wiring in a later commit.
 */
const MAX_BYTES = 2048;
function truncate(s: string): string {
  if (s.length <= MAX_BYTES) return s;
  return `${s.slice(0, MAX_BYTES)}…[truncated]`;
}
