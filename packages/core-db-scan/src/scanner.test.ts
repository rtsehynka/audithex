import type { PatternBundle, RuleDocument, RulesPack } from '@audithex/core-types';
import { newDb } from 'pg-mem';
import { describe, expect, it } from 'vitest';
import { scanDatabase } from './index.js';

/**
 * The Postgres scanner runs the rules pack's secret-pattern bundles
 * against text-shaped column values. These tests use pg-mem, an
 * in-memory Postgres compatible enough for `information_schema`
 * inspection + SELECT against user tables. The Client constructor
 * exposed by pg-mem's adapter is passed straight through to
 * scanDatabase via the `clientFactory` option — no `vi.mock` needed.
 */

function makeRulesPack(): RulesPack {
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
    const events: Array<{ table: string; index: number; total: number }> = [];
    await scanDatabase({
      connection: { driver: 'postgres', uri: 'postgres://test/x' },
      rulesPack: makeRulesPack(),
      tables: ['public.documents', 'public.chunks'],
      scanAllTables: false,
      clientFactory: pg.Client,
      onTableScanned: (e) => events.push({ table: e.table, index: e.index, total: e.total }),
    });
    expect(events).toHaveLength(2);
    expect(events[0]?.index).toBe(1);
    expect(events[1]?.index).toBe(2);
    expect(events[1]?.total).toBe(2);
  });
});
