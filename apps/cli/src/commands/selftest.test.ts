import { discover } from '@audithex/core-discovery';
import { bundledFixturesRoot, evaluateFixture, loadFixture } from '@audithex/core-eval-runner';
import { runRules } from '@audithex/core-rules';
import { describe, expect, it } from 'vitest';

describe('selftest end-to-end against fixture-banking-bot', () => {
  it('passes precision >= 0.95 and recall >= 0.9', () => {
    const fixture = loadFixture('fixture-banking-bot', bundledFixturesRoot());
    const discovery = discover({ rootPath: fixture.rootPath });
    const findings = runRules(discovery);
    const result = evaluateFixture(fixture.expected, findings);
    expect(result.passed).toBe(true);
    expect(result.precision).toBeGreaterThanOrEqual(0.95);
    expect(result.recall).toBeGreaterThanOrEqual(0.9);
    expect(result.truePositives).toBe(fixture.expected.expectedFindings.length);
    expect(result.falseNegatives).toBe(0);
  });
});
