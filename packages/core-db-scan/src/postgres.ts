import type { Finding } from '@audithex/core-types';
import * as pgModule from 'pg';
import { type SecretRule, matchValueIntoFindings, safeUriDatabase } from './shared.js';

export type PgClientCtor = typeof import('pg').Client;
export type PgClient = InstanceType<PgClientCtor>;

export interface PgConnectionConfig {
  driver: 'postgres';
  uri: string;
  database?: string | null;
}

export interface ScanPostgresArgs {
  connection: PgConnectionConfig;
  tables: readonly string[];
  scanAllTables: boolean;
  rowLimit: number;
  rules: readonly SecretRule[];
  clientFactory?: PgClientCtor;
  onTableScanned?: (e: {
    table: string;
    rowsScanned: number;
    findingsAdded: number;
    index: number;
    total: number;
  }) => void;
}

export interface PostgresScanOutcome {
  findings: Finding[];
  tablesScanned: string[];
  rowsScanned: number;
}

export async function scanPostgres(args: ScanPostgresArgs): Promise<PostgresScanOutcome> {
  const findings: Finding[] = [];
  const client = await connect(args.connection, args.clientFactory);
  try {
    const tables = args.tables.length > 0 ? [...args.tables] : await listUserTables(client);
    const databaseLabel = args.connection.database ?? safeUriDatabase(args.connection.uri);
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

export async function listUserTables(client: PgClient): Promise<string[]> {
  const result = await client.query<{ table_schema: string; table_name: string }>(
    `SELECT table_schema, table_name
       FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name`,
  );
  return result.rows.map((r) => `${r.table_schema}.${r.table_name}`);
}

export async function probePostgres(
  config: PgConnectionConfig,
  factory?: PgClientCtor,
): Promise<{ ok: boolean; message?: string; tables: string[] }> {
  try {
    const client = await connect(config, factory);
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

async function scanTable(args: {
  client: PgClient;
  table: string;
  rowLimit: number;
  databaseLabel: string;
  rules: readonly SecretRule[];
  findings: Finding[];
}): Promise<number> {
  const { schema, name } = splitQualified(args.table);
  const columns = await args.client.query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2`,
    [schema, name],
  );
  const textColumns = columns.rows.filter((c) => isTextLike(c.data_type)).map((c) => c.column_name);
  if (textColumns.length === 0) return 0;

  const selectList = textColumns.map((c) => `"${c}"`).join(', ');
  const rows = await args.client.query(`SELECT ${selectList} FROM "${schema}"."${name}" LIMIT $1`, [
    args.rowLimit,
  ]);
  let rowIndex = 0;
  for (const row of rows.rows as Record<string, unknown>[]) {
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
  return rows.rows.length;
}

function isTextLike(dataType: string): boolean {
  const t = dataType.toLowerCase();
  return (
    t === 'text' ||
    t === 'character varying' ||
    t === 'varchar' ||
    t === 'character' ||
    t === 'char' ||
    t === 'citext' ||
    t === 'json' ||
    t === 'jsonb'
  );
}

function splitQualified(table: string): { schema: string; name: string } {
  const idx = table.indexOf('.');
  if (idx === -1) return { schema: 'public', name: table };
  return { schema: table.slice(0, idx), name: table.slice(idx + 1) };
}

async function connect(config: PgConnectionConfig, factory?: PgClientCtor): Promise<PgClient> {
  const Ctor = factory ?? pgModule.Client;
  const clientConfig = config.database
    ? { connectionString: config.uri, database: config.database }
    : { connectionString: config.uri };
  const client = new Ctor(clientConfig);
  await client.connect();
  return client;
}
