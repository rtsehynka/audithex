import { describe, expect, it } from 'vitest';
import { type Finding, exitCodeFromFindings } from './index.js';

function finding(severity: Finding['severity']): Finding {
  return {
    kind: 'static',
    ruleId: 'R000',
    severity,
    owasp: ['LLM01'],
    blockId: 'block:test',
    location: { file: 'x.ts', line: 1 },
    messageKey: 'k',
    rationaleKey: 'r',
    fixKey: 'f',
  };
}

describe('exitCodeFromFindings', () => {
  it('returns 0 when no findings', () => {
    expect(exitCodeFromFindings([])).toBe(0);
  });

  it('returns 1 when only low/medium findings', () => {
    expect(exitCodeFromFindings([finding('low'), finding('medium')])).toBe(1);
  });

  it('returns 2 when any high finding', () => {
    expect(exitCodeFromFindings([finding('low'), finding('high')])).toBe(2);
  });

  it('returns 2 when any critical finding', () => {
    expect(exitCodeFromFindings([finding('critical')])).toBe(2);
  });
});
