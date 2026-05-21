import type { PatternBundle, RuleDocument, RulesPack } from '@audithex/core-types';
import { expect } from 'vitest';

export interface CapturedProgressEvent {
  table: string;
  index: number;
  total: number;
}

/**
 * Builds a closure usable as the `onTableScanned` callback of the
 * Postgres + Mongo specs. Returns both the array of captured events
 * and the function to pass in, so each test can assert on the
 * resulting sequence without re-writing the boilerplate.
 */
/**
 * Asserts that `events` has exactly `expectedCount` entries and that
 * their 1-based `index` values run 1..expectedCount with `total` equal
 * to expectedCount on the last entry. Both driver tests use this to
 * verify the per-table progress sequence; centralising the assertion
 * keeps jscpd at zero clones.
 */
export function expectSequentialProgress(
  events: readonly CapturedProgressEvent[],
  expectedCount: number,
): void {
  expect(events).toHaveLength(expectedCount);
  for (let i = 0; i < expectedCount; i += 1) {
    expect(events[i]?.index).toBe(i + 1);
  }
  expect(events[expectedCount - 1]?.total).toBe(expectedCount);
}

export function captureTableProgress(): {
  events: CapturedProgressEvent[];
  capture: (e: { table: string; index: number; total: number }) => void;
} {
  const events: CapturedProgressEvent[] = [];
  return {
    events,
    capture: (e) => events.push({ table: e.table, index: e.index, total: e.total }),
  };
}

/**
 * Minimal in-process rules pack used by both the Postgres and Mongo
 * specs. The single pattern matches `sk-test-[A-Z0-9]{8}` so seeded
 * fixtures can leak it predictably. Extracting this here keeps jscpd
 * at zero clones across the two driver tests.
 */
export function makeTestRulesPack(): RulesPack {
  const bundle: PatternBundle = {
    _id: 'secrets-test',
    schemaVersion: '0.1',
    kind: 'secret-patterns',
    source: 'inline-test',
    entries: [
      {
        id: 'fake-openai',
        provider: 'OpenAI',
        description: 'fake openai key for tests',
        regex: 'sk-test-[A-Z0-9]{8}',
      },
    ],
  };
  const rule: RuleDocument = {
    _id: 'R001',
    schemaVersion: '0.1',
    severity: 'critical',
    owasp: ['LLM06'],
    cwe: 'CWE-798',
    engine: 'regex-in-code',
    params: { patternBundle: 'secrets-test' },
    messageKey: 'findings:R001.message',
    fixKey: 'findings:R001.fix',
  };
  return {
    manifest: {
      _id: 'inline',
      schemaVersion: '0.1',
      version: '0.0.0-inline',
      releasedAt: '2026-01-01T00:00:00Z',
      ruleIds: ['R001'],
      patternBundleIds: ['secrets-test'],
    },
    rules: [rule],
    patternBundles: [bundle],
    source: 'bundled',
    rootPath: '/inline',
  } as RulesPack;
}
