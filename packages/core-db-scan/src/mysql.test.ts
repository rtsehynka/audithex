import { describe, expect, it } from 'vitest';
import { scanDatabase } from './index.js';
import type { MysqlClientFactory, MysqlClientLike } from './mysql.js';
import {
  captureTableProgress,
  expectSequentialProgress,
  makeTestRulesPack,
} from './test-helpers.js';

/**
 * MySQL scanner spec. There is no `mysql-mem` equivalent of `pg-mem`,
 * so we inject an in-process fake client through `mysqlClientFactory`
 * — same pattern the Postgres spec uses with `clientFactory`. The
 * fake answers the two `information_schema` SELECTs the scanner issues
 * (TABLES + COLUMNS) and the per-table data SELECT, and otherwise
 * behaves like a `mysql2/promise` Connection.
 */

interface Row {
  body: string;
  author: string;
}

interface ChunkRow {
  content: string;
}

const SEED: Record<string, Row[] | ChunkRow[]> = {
  'rag.documents': [
    { body: 'hello, this leaks sk-test-ABCDEFGH', author: 'alice' },
    { body: 'clean row', author: 'bob' },
    { body: 'embedded sk-test-12345XYZ inside', author: 'charlie' },
  ],
  'rag.chunks': [{ content: 'no secret here' }],
};

function makeFakeClient(): MysqlClientLike {
  return {
    async query<T>(sql: string, params?: readonly unknown[]): Promise<[T[], unknown]> {
      // information_schema.TABLES enumeration
      if (/FROM information_schema\.TABLES/i.test(sql)) {
        return [
          [
            { TABLE_SCHEMA: 'rag', TABLE_NAME: 'documents' },
            { TABLE_SCHEMA: 'rag', TABLE_NAME: 'chunks' },
          ] as unknown as T[],
          undefined,
        ];
      }
      // information_schema.COLUMNS enumeration
      if (/FROM information_schema\.COLUMNS/i.test(sql)) {
        const [schema, name] = (params ?? []) as [string, string];
        if (schema === 'rag' && name === 'documents') {
          return [
            [
              { COLUMN_NAME: 'body', DATA_TYPE: 'text' },
              { COLUMN_NAME: 'author', DATA_TYPE: 'varchar' },
            ] as unknown as T[],
            undefined,
          ];
        }
        if (schema === 'rag' && name === 'chunks') {
          return [[{ COLUMN_NAME: 'content', DATA_TYPE: 'text' }] as unknown as T[], undefined];
        }
        return [[] as unknown as T[], undefined];
      }
      // data SELECT — recover schema.table from backticks
      const match = sql.match(/FROM `([^`]+)`\.`([^`]+)`/);
      if (match) {
        const key = `${match[1]}.${match[2]}`;
        const rows = SEED[key] ?? [];
        return [rows as unknown as T[], undefined];
      }
      throw new Error(`unexpected sql: ${sql}`);
    },
    async end(): Promise<void> {
      // no-op
    },
  };
}

const fakeFactory: MysqlClientFactory = async () => makeFakeClient();

describe('scanDatabase — mysql driver', () => {
  it('finds two secret matches in documents.body', async () => {
    const result = await scanDatabase({
      connection: { driver: 'mysql', uri: 'mysql://test/rag', database: 'rag' },
      rulesPack: makeTestRulesPack(),
      tables: ['rag.documents'],
      scanAllTables: false,
      mysqlClientFactory: fakeFactory,
    });
    expect(result.tablesScanned).toEqual(['rag.documents']);
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0]?.ruleId).toBe('R001');
    expect(result.findings[0]?.severity).toBe('critical');
    const f0 = result.findings[0];
    if (!f0 || f0.kind !== 'static') throw new Error('expected static finding');
    expect(f0.location.file).toMatch(/db:\/\/rag\/rag\.documents\?row=\d+&column=body/);
    expect(result.rowsScanned).toBe(3);
  });

  it('walks every table when scanAllTables is enabled', async () => {
    const result = await scanDatabase({
      connection: { driver: 'mysql', uri: 'mysql://test/rag', database: 'rag' },
      rulesPack: makeTestRulesPack(),
      tables: [],
      scanAllTables: true,
      mysqlClientFactory: fakeFactory,
    });
    expect(result.tablesScanned.sort()).toEqual(['rag.chunks', 'rag.documents']);
    expect(result.findings).toHaveLength(2);
  });

  it('refuses to walk the whole DB when scanAllTables is off and tables is empty', async () => {
    await expect(
      scanDatabase({
        connection: { driver: 'mysql', uri: 'mysql://test/rag', database: 'rag' },
        rulesPack: makeTestRulesPack(),
        tables: [],
        scanAllTables: false,
        mysqlClientFactory: fakeFactory,
      }),
    ).rejects.toThrow(/refusing to walk the full database/);
  });

  it('emits onTableScanned progress for every table', async () => {
    const { events, capture } = captureTableProgress();
    await scanDatabase({
      connection: { driver: 'mysql', uri: 'mysql://test/rag', database: 'rag' },
      rulesPack: makeTestRulesPack(),
      tables: ['rag.documents', 'rag.chunks'],
      scanAllTables: false,
      mysqlClientFactory: fakeFactory,
      onTableScanned: capture,
    });
    expectSequentialProgress(events, 2);
  });
});
