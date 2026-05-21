import { afterEach, describe, expect, it } from 'vitest';
import { getAiFixModel } from './models/ai-fix.js';
import { findAiFix, listAiFixesForScan, saveAiFix } from './repository.js';
import { setupMongoFixture } from './test-helpers/mongo-fixture.js';

const { getConn } = setupMongoFixture();

afterEach(async () => {
  await getAiFixModel(getConn()).deleteMany({});
});

function fakeInput(
  scanId: string,
  findingKey: string,
  response = 'use parameterised queries',
): Parameters<typeof saveAiFix>[1] {
  return {
    scanId,
    findingKey,
    ruleId: findingKey.split('|')[0] ?? 'R000',
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    costUsd: 0.0042,
    inputTokens: 432,
    outputTokens: 218,
    prompt: 'How do I fix this finding?',
    response,
  };
}

describe('AI fix cache', () => {
  it('saves a fix and finds it back by (scanId, findingKey)', async () => {
    await saveAiFix(getConn(), fakeInput('scan-1', 'R001|src/agent.ts|4'));
    const found = await findAiFix(getConn(), 'scan-1', 'R001|src/agent.ts|4');
    expect(found?.response).toBe('use parameterised queries');
    expect(found?.costUsd).toBe(0.0042);
  });

  it('upserts on a repeat save for the same key', async () => {
    await saveAiFix(getConn(), fakeInput('scan-1', 'R001|src/agent.ts|4', 'first answer'));
    await saveAiFix(getConn(), fakeInput('scan-1', 'R001|src/agent.ts|4', 'better answer'));
    const fixes = await listAiFixesForScan(getConn(), 'scan-1');
    expect(fixes).toHaveLength(1);
    expect(fixes[0]?.response).toBe('better answer');
  });

  it('lists every fix for a scan, oldest first', async () => {
    await saveAiFix(getConn(), fakeInput('scan-2', 'R001|src/agent.ts|4', 'fix A'));
    await saveAiFix(getConn(), fakeInput('scan-2', 'R005|src/agent.ts|8', 'fix B'));
    const fixes = await listAiFixesForScan(getConn(), 'scan-2');
    expect(fixes).toHaveLength(2);
    expect(fixes.map((f) => f.response)).toEqual(['fix A', 'fix B']);
  });

  it('returns null when the cache is empty for a finding', async () => {
    const found = await findAiFix(getConn(), 'scan-1', 'R002|other.ts|1');
    expect(found).toBeNull();
  });
});
