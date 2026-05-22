/**
 * Typed errors thrown by the dynamic-scan runner. Each one carries a
 * stable `code` so the CLI / web layer can branch on category without
 * pattern-matching error messages.
 *
 * These errors are never thrown speculatively as placeholders. Every
 * code path that constructs one represents a real, observable failure
 * the runner must surface (budget exhaustion, network rejection, CI
 * guard, unsupported judge type at payload load).
 */

export type DynamicScanErrorCode =
  | 'BUDGET_EXCEEDED'
  | 'TARGET_NETWORK'
  | 'REAL_AGENT_CALL_IN_CI'
  | 'UNSUPPORTED_JUDGE';

export class DynamicScanError extends Error {
  readonly code: DynamicScanErrorCode;
  constructor(code: DynamicScanErrorCode, message: string) {
    super(message);
    this.name = 'DynamicScanError';
    this.code = code;
  }
}

export class BudgetExceededError extends DynamicScanError {
  readonly maxUsd: number;
  readonly spentUsd: number;
  constructor(maxUsd: number, spentUsd: number) {
    super(
      'BUDGET_EXCEEDED',
      `Dynamic-scan budget cap of $${maxUsd.toFixed(4)} reached (spent $${spentUsd.toFixed(4)}).`,
    );
    this.name = 'BudgetExceededError';
    this.maxUsd = maxUsd;
    this.spentUsd = spentUsd;
  }
}

/**
 * Thrown when `callTarget` refuses to dispatch a request because of a
 * scheme, address, redirect, or timeout policy. Refusing is the safe
 * default — Audithex only attacks targets the user has explicitly
 * opted in to over public HTTPS.
 */
export class TargetNetworkError extends DynamicScanError {
  readonly reason:
    | 'scheme-not-allowed'
    | 'internal-address-blocked'
    | 'redirect-disallowed'
    | 'timeout'
    | 'unreachable'
    | 'http-error';
  readonly endpoint: string;
  constructor(reason: TargetNetworkError['reason'], endpoint: string, message: string) {
    super('TARGET_NETWORK', message);
    this.name = 'TargetNetworkError';
    this.reason = reason;
    this.endpoint = endpoint;
  }
}

/**
 * Thrown when the CI guard detects that we are running inside a CI
 * environment (`CI=true`) without the explicit `AUDITHEX_TEST_AGENT_URL`
 * mock-agent override. Prevents accidental spend against a real LLM
 * during automated test runs.
 */
export class RealAgentCallInCiError extends DynamicScanError {
  constructor() {
    super(
      'REAL_AGENT_CALL_IN_CI',
      'Refusing to call a real agent endpoint from CI. Set AUDITHEX_TEST_AGENT_URL to a mock endpoint, or unset CI for ad-hoc local runs.',
    );
    this.name = 'RealAgentCallInCiError';
  }
}

/**
 * Thrown at payload-load time when a rule declares a judge.type the
 * runner does not implement. Today only `refusal` is registered;
 * `regex` and `llm` types are reserved for future slices. Surfacing
 * this as a hard error (rather than a silent skip or a stub) makes
 * the limitation discoverable.
 */
export class UnsupportedJudgeError extends DynamicScanError {
  readonly judgeType: string;
  readonly ruleId: string;
  constructor(judgeType: string, ruleId: string) {
    super(
      'UNSUPPORTED_JUDGE',
      `Rule ${ruleId} uses judge.type="${judgeType}", which the dynamic-scan runner does not yet support. Only "refusal" is enabled in this Audithex slice.`,
    );
    this.name = 'UnsupportedJudgeError';
    this.judgeType = judgeType;
    this.ruleId = ruleId;
  }
}
