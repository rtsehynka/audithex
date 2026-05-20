import { describe, expect, it } from 'vitest';
import { compareSemver, evaluateUpdate } from './index.js';

describe('compareSemver', () => {
  it('returns positive when left is newer', () => {
    expect(compareSemver('1.2.0', '1.1.9')).toBeGreaterThan(0);
  });

  it('returns negative when left is older', () => {
    expect(compareSemver('1.0.0', '1.0.1')).toBeLessThan(0);
  });

  it('returns zero on equal versions', () => {
    expect(compareSemver('2.3.4', '2.3.4')).toBe(0);
  });

  it('treats pre-release suffixes as the base version', () => {
    expect(compareSemver('1.0.0-dev', '1.0.0')).toBe(0);
  });
});

describe('evaluateUpdate', () => {
  it('reports up-to-date when current >= latest', () => {
    const r = evaluateUpdate('1.0.0', '1.0.0');
    expect(r.upToDate).toBe(true);
  });

  it('reports update available when current < latest', () => {
    const r = evaluateUpdate('1.0.0', '1.1.0');
    expect(r.upToDate).toBe(false);
  });
});
