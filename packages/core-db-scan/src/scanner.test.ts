import { newDb } from 'pg-mem';
import { describe, expect, it } from 'vitest';
import { scanDatabase } from './index.js';
import {
  captureTableProgress,
  expectSequentialProgress,
  makeTestRulesPack as makeRulesPack,
} from './test-helpers.js';

/**
 * The Postgres scanner runs the rules pack's secret-pattern bundles
 * against text-shaped column values. These tests use pg-mem, an
 * in-memory Postgres compatible enough for `information_schema`
 * inspection + SELECT against user tables. The Client constructor
 * exposed by pg-mem's adapter is passed straight through to
 * scanDatabase via the `clientFactory` option — no `vi.mock` needed.
 */

function makePgAdapter(): typeof import('pg') {
  const db = newDb();
  db.public.none(`
    CREATE TABLE documents (id serial PRIMARY KEY, body text);
    INSERT INTO documents (body) VALUES
      ('hello, this leaks sk-test-ABCDEFGH'),
      ('clean row'),
      ('another sk-test-12345XYZ row');
    CREATE TABLE chunks (id serial PRIMARY KEY, content varchar(500));
    INSERT INTO chunks (content) VALUES ('no secret here');
  `);
  return db.adapters.createPg() as unknown as typeof import('pg');
}

describe('scanDatabase (postgres via pg-mem)', () => {
  it('finds two findings against documents.body matching the secret regex', async () => {
    const pg = makePgAdapter();
    const result = await scanDatabase({
      connection: { driver: 'postgres', uri: 'postgres://test/x', database: 'test' },
      rulesPack: makeRulesPack(),
      tables: ['public.documents'],
      scanAllTables: false,
      clientFactory: pg.Client,
    });
    expect(result.tablesScanned).toEqual(['public.documents']);
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0]?.ruleId).toBe('R001');
    expect(result.findings[0]?.severity).toBe('critical');
    expect(result.findings[0]?.location.file).toContain('db://test/public.documents');
    expect(result.rowsScanned).toBe(3);
  });

  it('refuses to walk the whole DB when scanAllTables is off and tables is empty', async () => {
    const pg = makePgAdapter();
    await expect(
      scanDatabase({
        connection: { driver: 'postgres', uri: 'postgres://test/x' },
        rulesPack: makeRulesPack(),
        tables: [],
        scanAllTables: false,
        clientFactory: pg.Client,
      }),
    ).rejects.toThrow(/refusing to walk the full database/);
  });

  it('walks every table when scanAllTables is enabled', async () => {
    const pg = makePgAdapter();
    const result = await scanDatabase({
      connection: { driver: 'postgres', uri: 'postgres://test/x' },
      rulesPack: makeRulesPack(),
      tables: [],
      scanAllTables: true,
      clientFactory: pg.Client,
    });
    expect(result.tablesScanned.sort()).toEqual(['public.chunks', 'public.documents']);
    expect(result.findings).toHaveLength(2);
  });

  it('emits onTableScanned progress for every table', async () => {
    const pg = makePgAdapter();
    const { events, capture } = captureTableProgress();
    await scanDatabase({
      connection: { driver: 'postgres', uri: 'postgres://test/x' },
      rulesPack: makeRulesPack(),
      tables: ['public.documents', 'public.chunks'],
      scanAllTables: false,
      clientFactory: pg.Client,
      onTableScanned: capture,
    });
    expectSequentialProgress(events, 2);
  });
});
