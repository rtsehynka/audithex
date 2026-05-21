import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Connection } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { connectMongo, disconnectAll } from './connect.js';
import { getAiFixModel } from './models/ai-fix.js';
import { findAiFix, listAiFixesForScan, saveAiFix } from './repository.js';

let mongo: MongoMemoryServer;
let conn: Connection;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  conn = await connectMongo(mongo.getUri());
}, 60_000);

afterAll(async () => {
  await disconnectAll();
  await mongo.stop();
});

afterEach(async () => {
  await getAiFixModel(conn).deleteMany({});
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
    await saveAiFix(conn, fakeInput('scan-1', 'R001|src/agent.ts|4'));
    const found = await findAiFix(conn, 'scan-1', 'R001|src/agent.ts|4');
    expect(found?.response).toBe('use parameterised queries');
    expect(found?.costUsd).toBe(0.0042);
  });

  it('upserts on a repeat save for the same key', async () => {
    await saveAiFix(conn, fakeInput('scan-1', 'R001|src/agent.ts|4', 'first answer'));
    await saveAiFix(conn, fakeInput('scan-1', 'R001|src/agent.ts|4', 'better answer'));
    const fixes = await listAiFixesForScan(conn, 'scan-1');
    expect(fixes).toHaveLength(1);
    expect(fixes[0]?.response).toBe('better answer');
  });

  it('lists every fix for a scan, oldest first', async () => {
    await saveAiFix(conn, fakeInput('scan-2', 'R001|src/agent.ts|4', 'fix A'));
    await saveAiFix(conn, fakeInput('scan-2', 'R005|src/agent.ts|8', 'fix B'));
    const fixes = await listAiFixesForScan(conn, 'scan-2');
    expect(fixes).toHaveLength(2);
    expect(fixes.map((f) => f.response)).toEqual(['fix A', 'fix B']);
  });

  it('returns null when the cache is empty for a finding', async () => {
    const found = await findAiFix(conn, 'scan-1', 'R002|other.ts|1');
    expect(found).toBeNull();
  });
});
