import type { PayloadJudgeType, RuleDocument } from '@audithex/core-types';
import { UnsupportedJudgeError } from '../errors.js';
import { type JudgeVerdict, type RefusalJudgeConfig, judgeRefusal } from './refusal.js';

export type { JudgeVerdict, RefusalJudgeConfig } from './refusal.js';
export { judgeRefusal } from './refusal.js';

/**
 * The shape carried inside a dynamic-attack rule's `params.judge`
 * slot. Mirrors `PayloadJudge` from `@audithex/core-payloads` but
 * lives here so the dispatcher does not import the data package just
 * for a type alias.
 */
export interface JudgeSpec {
  type: PayloadJudgeType;
  config?: Record<string, unknown>;
}

/**
 * Set of judge types this build of Audithex knows how to evaluate.
 * Today only `refusal` is wired; future slices add `regex` and `llm`.
 *
 * Listing the set explicitly (rather than relying on a `switch`-with-
 * unreachable-default) makes the supported surface easy to discover.
 */
export const SUPPORTED_JUDGE_TYPES: ReadonlySet<PayloadJudgeType> = new Set(['refusal']);

/**
 * Runs at payload-load time before any network call is dispatched.
 * Throws `UnsupportedJudgeError` so the runner can refuse to start
 * with a clear, actionable message — never a silent skip or a stub.
 */
export function validateJudge(rule: RuleDocument): void {
  const judge = readJudgeSpec(rule);
  if (!judge) {
    throw new UnsupportedJudgeError('<missing>', rule._id);
  }
  if (!SUPPORTED_JUDGE_TYPES.has(judge.type)) {
    throw new UnsupportedJudgeError(judge.type, rule._id);
  }
}

/**
 * Dispatches the in-memory response to the right judge implementation
 * for the rule. Returns the verdict; never throws on unknown types
 * because `validateJudge` is expected to have run first (the runner
 * calls it before any network IO so a misconfigured rule fails fast).
 */
export function judgeResponse(rule: RuleDocument, response: string): JudgeVerdict {
  const judge = readJudgeSpec(rule);
  if (!judge) {
    throw new UnsupportedJudgeError('<missing>', rule._id);
  }
  switch (judge.type) {
    case 'refusal':
      return judgeRefusal(response, judge.config as RefusalJudgeConfig | undefined);
    default:
      throw new UnsupportedJudgeError(judge.type, rule._id);
  }
}

function readJudgeSpec(rule: RuleDocument): JudgeSpec | null {
  const params = rule.params as { judge?: unknown } | undefined;
  if (!params || typeof params !== 'object') return null;
  const judge = (params as { judge?: unknown }).judge;
  if (!judge || typeof judge !== 'object') return null;
  const type = (judge as { type?: unknown }).type;
  if (typeof type !== 'string') return null;
  const config = (judge as { config?: unknown }).config;
  return {
    type: type as PayloadJudgeType,
    ...(config && typeof config === 'object' ? { config: config as Record<string, unknown> } : {}),
  };
}
