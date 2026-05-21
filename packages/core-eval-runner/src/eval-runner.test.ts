import type { Finding } from '@audithex/core-types';
import { describe, expect, it } from 'vitest';
import { evaluateFixture } from './index.js';

function finding(ruleId: string, file: string, line: number): Finding {
  return {
    kind: 'static',
    ruleId,
    severity: 'critical',
    owasp: ['LLM06'],
    blockId: 'block:test',
    location: { file, line },
    messageKey: 'm',
    rationaleKey: 'r',
    fixKey: 'f',
  };
}

describe('evaluateFixture', () => {
  it('passes when every expected finding is detected and nothing else', () => {
    const result = evaluateFixture(
      {
        schemaVersion: '0.1',
        fixture: 'banking',
        expectedFindings: [{ ruleId: 'R001', file: 'a.ts', line: 1 }],
        notExpected: [],
      },
      [finding('R001', 'a.ts', 1)],
    );
    expect(result.passed).toBe(true);
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
  });

  it('counts a false negative when an expected finding is missing', () => {
    const result = evaluateFixture(
      {
        schemaVersion: '0.1',
        fixture: 'banking',
        expectedFindings: [{ ruleId: 'R001', file: 'a.ts', line: 1 }],
        notExpected: [],
      },
      [],
    );
    expect(result.falseNegatives).toBe(1);
    expect(result.recall).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('counts a false positive when an unexpected finding is declared in notExpected', () => {
    const result = evaluateFixture(
      {
        schemaVersion: '0.1',
        fixture: 'banking',
        expectedFindings: [],
        notExpected: [{ ruleId: 'R013', file: 'b.ts', line: 5 }],
      },
      [finding('R013', 'b.ts', 5)],
    );
    expect(result.falsePositives).toBe(1);
    expect(result.passed).toBe(false);
  });
});
