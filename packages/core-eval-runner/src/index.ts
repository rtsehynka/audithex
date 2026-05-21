import type { Finding } from '@audithex/core-types';

export {
  bundledFixturesRoot,
  listAvailableFixtures,
  loadFixture,
  type LoadedFixture,
} from './fixture-loader.js';

export interface ExpectedFinding {
  ruleId: string;
  file: string;
  line?: number;
  rationale?: string;
}

export interface ExpectedFixture {
  schemaVersion: string;
  fixture: string;
  expectedFindings: ExpectedFinding[];
  notExpected: ExpectedFinding[];
}

export interface FixtureEvaluationResult {
  fixture: string;
  expected: number;
  detected: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  passed: boolean;
}

export interface EvaluationThresholds {
  precision: number;
  recall: number;
}

export const DEFAULT_THRESHOLDS: EvaluationThresholds = {
  precision: 0.95,
  recall: 0.9,
};

function findingMatches(expected: ExpectedFinding, actual: Finding): boolean {
  if (expected.ruleId !== actual.ruleId) return false;
  // Dynamic findings have no file/line — they match by ruleId alone.
  // The expected fixture for a dynamic finding leaves `file` empty.
  if (actual.kind !== 'static') {
    return expected.file === '' || expected.file === undefined;
  }
  if (expected.file !== actual.location.file) return false;
  if (expected.line !== undefined && expected.line !== actual.location.line) return false;
  return true;
}

export function evaluateFixture(
  expected: ExpectedFixture,
  actual: readonly Finding[],
  thresholds: EvaluationThresholds = DEFAULT_THRESHOLDS,
): FixtureEvaluationResult {
  let truePositives = 0;
  let falseNegatives = 0;

  for (const e of expected.expectedFindings) {
    const matched = actual.some((a) => findingMatches(e, a));
    if (matched) {
      truePositives += 1;
    } else {
      falseNegatives += 1;
    }
  }

  let falsePositives = 0;
  for (const a of actual) {
    const wasExpected = expected.expectedFindings.some((e) => findingMatches(e, a));
    if (wasExpected) continue;
    const explicitlyDeclined = expected.notExpected.some((n) => findingMatches(n, a));
    if (explicitlyDeclined) {
      falsePositives += 1;
    }
  }

  const detected = actual.length;
  const precisionDenominator = truePositives + falsePositives;
  const recallDenominator = truePositives + falseNegatives;
  const precision = precisionDenominator === 0 ? 1 : truePositives / precisionDenominator;
  const recall = recallDenominator === 0 ? 1 : truePositives / recallDenominator;
  const passed = precision >= thresholds.precision && recall >= thresholds.recall;

  return {
    fixture: expected.fixture,
    expected: expected.expectedFindings.length,
    detected,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    passed,
  };
}
