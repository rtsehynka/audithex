import type { Finding } from '@audithex/core-types';
import { type SecretRule, matchValueIntoFindings, safeUriDatabase } from './shared.js';

/**
 * Minimal client contract the MySQL scanner needs. Matches the surface
 * area of `mysql2/promise` `Connection`: `query()` returns `[rows, ..]`
 * and `end()` closes the socket. Defining it as an explicit interface
 * lets tests inject an in-process mock without pulling `mysql2` into
 * the test runtime — same pattern as `clientFactory` for Postgres.
 */
export interface MysqlClientLike {
  query<T>(sql: string, params?: readonly unknown[]): Promise<[T[], unknown]>;
  end(): Promise<void>;
}

export type MysqlClientFactory = (config: {
  uri: string;
  database?: string | null;
}) => Promise<MysqlClientLike>;

export interface MysqlConnectionConfig {
  driver: 'mysql';
  uri: string;
  database?: string | null;
}

export interface ScanMysqlArgs {
  connection: MysqlConnectionConfig;
  tables: readonly string[];
  scanAllTables: boolean;
  rowLimit: number;
  rules: readonly SecretRule[];
  clientFactory?: MysqlClientFactory;
  onTableScanned?: (e: {
    table: string;
    rowsScanned: number;
    findingsAdded: number;
    index: number;
    total: number;
  }) => void;
}

export interface MysqlScanOutcome {
  findings: Finding[];
  tablesScanned: string[];
  rowsScanned: number;
}

export async function scanMysql(args: ScanMysqlArgs): Promise<MysqlScanOutcome> {
  const findings: Finding[] = [];
  const factory = args.clientFactory ?? defaultMysqlClientFactory;
  const client = await factory({
    uri: args.connection.uri,
    ...(args.connection.database !== undefined ? { database: args.connection.database } : {}),
  });
  try {
    const databaseLabel = args.connection.database ?? safeUriDatabase(args.connection.uri);
    const tables = args.tables.length > 0 ? [...args.tables] : await listUserTables(client);
    let totalRows = 0;
    for (let i = 0; i < tables.length; i += 1) {
      const table = tables[i] as string;
      const before = findings.length;
      const rows = await scanTable({
        client,
        table,
        rowLimit: args.rowLimit,
        databaseLabel,
        rules: args.rules,
        findings,
      });
      totalRows += rows;
      args.onTableScanned?.({
        table,
        rowsScanned: rows,
        findingsAdded: findings.length - before,
        index: i + 1,
        total: tables.length,
      });
    }
    return { findings, tablesScanned: tables, rowsScanned: totalRows };
  } finally {
    await client.end();
  }
}

export async function probeMysql(
  config: MysqlConnectionConfig,
  factory?: MysqlClientFactory,
): Promise<{ ok: boolean; message?: string; tables: string[] }> {
  const f = factory ?? defaultMysqlClientFactory;
  try {
    const client = await f({
      uri: config.uri,
      ...(config.database !== undefined ? { database: config.database } : {}),
    });
    try {
      const tables = await listUserTables(client);
      return { ok: true, tables };
    } finally {
      await client.end();
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err), tables: [] };
  }
}

export async function listUserTables(client: MysqlClientLike): Promise<string[]> {
  const [rows] = await client.query<{ TABLE_SCHEMA: string; TABLE_NAME: string }>(
    `SELECT TABLE_SCHEMA, TABLE_NAME
       FROM information_schema.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
      ORDER BY TABLE_SCHEMA, TABLE_NAME`,
  );
  return rows.map((r) => `${r.TABLE_SCHEMA}.${r.TABLE_NAME}`);
}

async function scanTable(args: {
  client: MysqlClientLike;
  table: string;
  rowLimit: number;
  databaseLabel: string;
  rules: readonly SecretRule[];
  findings: Finding[];
}): Promise<number> {
  const { schema, name } = splitQualified(args.table, args.databaseLabel);
  const [columns] = await args.client.query<{ COLUMN_NAME: string; DATA_TYPE: string }>(
    `SELECT COLUMN_NAME, DATA_TYPE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [schema, name],
  );
  const textColumns = columns.filter((c) => isTextLike(c.DATA_TYPE)).map((c) => c.COLUMN_NAME);
  if (textColumns.length === 0) return 0;

  const selectList = textColumns.map((c) => `\`${c}\``).join(', ');
  const [rows] = await args.client.query<Record<string, unknown>>(
    `SELECT ${selectList} FROM \`${schema}\`.\`${name}\` LIMIT ${Number(args.rowLimit)}`,
  );
  let rowIndex = 0;
  for (const row of rows) {
    rowIndex += 1;
    for (const col of textColumns) {
      const value = row[col];
      if (typeof value !== 'string') continue;
      matchValueIntoFindings({
        value,
        rules: args.rules,
        locationFile: `db://${args.databaseLabel}/${schema}.${name}?row=${rowIndex}&column=${col}`,
        positionIndex: rowIndex,
        out: args.findings,
      });
    }
  }
  return rows.length;
}

function isTextLike(dataType: string): boolean {
  const t = dataType.toLowerCase();
  return (
    t === 'char' ||
    t === 'varchar' ||
    t === 'text' ||
    t === 'tinytext' ||
    t === 'mediumtext' ||
    t === 'longtext' ||
    t === 'json' ||
    t === 'enum' ||
    t === 'set'
  );
}

function splitQualified(table: string, fallbackSchema: string): { schema: string; name: string } {
  const idx = table.indexOf('.');
  if (idx === -1) return { schema: fallbackSchema, name: table };
  return { schema: table.slice(0, idx), name: table.slice(idx + 1) };
}

const defaultMysqlClientFactory: MysqlClientFactory = async ({ uri, database }) => {
  // `mysql2` is loaded lazily so the dependency only resolves when a
  // real MySQL scan runs. Tests inject `clientFactory` and never hit
  // this path.
  const mod = (await import('mysql2/promise')) as unknown as {
    createConnection: (cfg: {
      uri?: string;
      database?: string;
    }) => Promise<MysqlClientLike>;
  };
  const cfg: { uri?: string; database?: string } = { uri };
  if (database) cfg.database = database;
  return mod.createConnection(cfg);
};
