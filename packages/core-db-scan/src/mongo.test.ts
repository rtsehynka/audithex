import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scanDatabase } from './index.js';
import {
  captureTableProgress,
  expectSequentialProgress,
  makeTestRulesPack as makeRulesPack,
} from './test-helpers.js';

/**
 * MongoDB scanner spec. Uses mongodb-memory-server so we never need
 * a real Mongo on the developer's machine. The fixture seeds two
 * collections — one with a fake-secret string field, one clean —
 * and asserts that the scanner picks the secret up and skips the
 * clean rows + non-string values.
 */

let mongod: MongoMemoryServer;
let uri: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  uri = mongod.getUri();
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('rag');
  await db.collection('documents').insertMany([
    { body: 'hello, this leaks sk-test-ABCDEFGH', author: 'alice' },
    { body: 'clean row', author: 'bob' },
    {
      body: 'embedded { value: sk-test-12345XYZ } inside',
      author: 'charlie',
      meta: { source: 'rag-import-2026' },
    },
  ]);
  await db.collection('chunks').insertMany([{ content: 'no secret here', score: 0.42 }]);
  await client.close();
}, 90_000);

afterAll(async () => {
  await mongod?.stop();
});

describe('scanDatabase — mongodb driver', () => {
  it('finds two secret matches in documents.body and tags the location with the field path', async () => {
    const result = await scanDatabase({
      connection: { driver: 'mongodb', uri, database: 'rag' },
      rulesPack: makeRulesPack(),
      tables: ['documents'],
      scanAllTables: false,
    });
    expect(result.tablesScanned).toEqual(['documents']);
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0]?.ruleId).toBe('R001');
    expect(result.findings[0]?.severity).toBe('critical');
    expect(result.findings[0]?.location.file).toMatch(/db:\/\/rag\/documents\?id=.+field=body/);
    expect(result.rowsScanned).toBe(3);
  });

  it('walks every collection when scanAllTables is enabled', async () => {
    const result = await scanDatabase({
      connection: { driver: 'mongodb', uri, database: 'rag' },
      rulesPack: makeRulesPack(),
      tables: [],
      scanAllTables: true,
    });
    expect(result.tablesScanned.sort()).toEqual(['chunks', 'documents']);
    expect(result.findings).toHaveLength(2);
  });

  it('refuses to walk the whole DB when scanAllTables is off and the table list is empty', async () => {
    await expect(
      scanDatabase({
        connection: { driver: 'mongodb', uri, database: 'rag' },
        rulesPack: makeRulesPack(),
        tables: [],
        scanAllTables: false,
      }),
    ).rejects.toThrow(/refusing to walk the full database/);
  });

  it('emits onTableScanned per collection with rising index', async () => {
    const { events, capture } = captureTableProgress();
    await scanDatabase({
      connection: { driver: 'mongodb', uri, database: 'rag' },
      rulesPack: makeRulesPack(),
      tables: ['documents', 'chunks'],
      scanAllTables: false,
      onTableScanned: capture,
    });
    expectSequentialProgress(events, 2);
  });
});
