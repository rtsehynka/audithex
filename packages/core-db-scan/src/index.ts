import type {
  Finding,
  OwaspLLMCategory,
  RuleDocument,
  RulesPack,
  SecretPatternEntry,
  Severity,
} from '@audithex/core-types';
import * as pgModule from 'pg';

type PgClientCtor = typeof import('pg').Client;
type PgClient = InstanceType<PgClientCtor>;

/**
 * RAG / operational database scanner. Connects to a project's target
 * database (Postgres for now), enumerates the requested tables, samples
 * text-shaped columns, and runs the secret-pattern bundles shipped in
 * the rules pack against the row content. Findings carry a synthetic
 * `db://<database>/<schema>/<table>?row=<pk>` location so the existing
 * report / persistence layer treats them like any other finding.
 *
 * Driver list will grow (MongoDB / MySQL / etc.) — this module owns
 * the dialect-specific bits; the orchestration in apps/cli + apps/web
 * stays driver-agnostic.
 */

export interface DbConnectionConfig {
  driver: 'postgres';
  uri: string;
  database?: string | null;
}

export interface DbScanOptions {
  connection: DbConnectionConfig;
  rulesPack: RulesPack;
  /** Specific tables to scan. Required unless scanAllTables is true. */
  tables: readonly string[];
  /** Walk every table the user can see. Off by default — opt-in only. */
  scanAllTables: boolean;
  /** Max rows sampled per table. Default 500. */
  rowLimit?: number;
  /** Optional progress callback used by SSE / CLI runners. */
  onTableScanned?: (event: DbTableScanEvent) => void;
  /**
   * Optional Postgres Client constructor. Production callers use the
   * default (the `pg` package); tests can pass pg-mem's adapter so we
   * never touch a real Postgres in vitest.
   */
  clientFactory?: PgClientCtor;
}

export interface DbTableScanEvent {
  table: string;
  rowsScanned: number;
  findingsAdded: number;
  /** 1-based position in the table list (after resolution). */
  index: number;
  total: number;
}

export interface DbScanResult {
  findings: Finding[];
  tablesScanned: string[];
  rowsScanned: number;
  elapsedMs: number;
}

const DEFAULT_ROW_LIMIT = 500;

export async function scanDatabase(options: DbScanOptions): Promise<DbScanResult> {
  if (options.connection.driver !== 'postgres') {
    throw new Error(`Unsupported db driver: ${options.connection.driver}`);
  }
  if (options.tables.length === 0 && !options.scanAllTables) {
    throw new Error(
      'No tables selected and scanAllTables is disabled — refusing to walk the full database without an explicit opt-in.',
    );
  }

  const startedAt = Date.now();
  const findings: Finding[] = [];
  const client = await connect(options.connection, options.clientFactory);
  try {
    const tables = options.tables.length > 0 ? [...options.tables] : await listUserTables(client);

    const ruleIndex = indexSecretRules(options.rulesPack);
    const databaseLabel = options.connection.database ?? safeUriDatabase(options.connection.uri);
    const rowLimit = options.rowLimit ?? DEFAULT_ROW_LIMIT;
    let totalRows = 0;
    for (let i = 0; i < tables.length; i += 1) {
      const table = tables[i] as string;
      const before = findings.length;
      const rows = await scanTable({
        client,
        table,
        rowLimit,
        databaseLabel,
        ruleIndex,
        findings,
      });
      totalRows += rows;
      options.onTableScanned?.({
        table,
        rowsScanned: rows,
        findingsAdded: findings.length - before,
        index: i + 1,
        total: tables.length,
      });
    }
    return {
      findings,
      tablesScanned: tables,
      rowsScanned: totalRows,
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    await client.end();
  }
}

/** Returns the names of user-owned tables in the connected database. */
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

/** Opens a connection, lists tables, closes. Surfaces connection errors. */
export async function probeConnection(
  config: DbConnectionConfig,
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

interface SecretRule {
  rule: RuleDocument;
  pattern: SecretPatternEntry;
  compiled: RegExp;
}

interface ScanTableArgs {
  client: PgClient;
  table: string;
  rowLimit: number;
  databaseLabel: string;
  ruleIndex: readonly SecretRule[];
  findings: Finding[];
}

async function scanTable(args: ScanTableArgs): Promise<number> {
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
      if (typeof value !== 'string' || value.length === 0) continue;
      for (const sr of args.ruleIndex) {
        const match = sr.compiled.exec(value);
        if (!match) continue;
        args.findings.push({
          ruleId: sr.rule._id,
          severity: sr.rule.severity as Severity,
          owasp: [...sr.rule.owasp] as OwaspLLMCategory[],
          ...(sr.rule.cwe ? { cwe: sr.rule.cwe } : {}),
          location: {
            file: `db://${args.databaseLabel}/${schema}.${name}?row=${rowIndex}&column=${col}`,
            line: rowIndex,
            column: 1,
          },
          messageKey: sr.rule.messageKey,
          messageParams: {
            provider: sr.pattern.provider,
            patternId: sr.pattern.id,
          },
          fixKey: sr.rule.fixKey,
        });
      }
    }
  }
  return rows.rows.length;
}

function indexSecretRules(pack: RulesPack): SecretRule[] {
  const bundles = new Map(pack.patternBundles.map((b) => [b._id, b]));
  const out: SecretRule[] = [];
  for (const rule of pack.rules) {
    if (rule.enabled === false) continue;
    if (rule.engine !== 'regex-in-code' && rule.engine !== 'regex-in-prompt') continue;
    const bundleId = (rule.params as { patternBundle?: string }).patternBundle;
    if (!bundleId) continue;
    const bundle = bundles.get(bundleId);
    if (!bundle) continue;
    if (bundle.kind !== 'secret-patterns') continue;
    for (const entry of bundle.entries) {
      try {
        out.push({ rule, pattern: entry, compiled: new RegExp(entry.regex) });
      } catch {
        // skip uncompilable patterns — they'd never have matched anyway.
      }
    }
  }
  return out;
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

async function connect(config: DbConnectionConfig, factory?: PgClientCtor): Promise<PgClient> {
  const Ctor = factory ?? pgModule.Client;
  const clientConfig = config.database
    ? { connectionString: config.uri, database: config.database }
    : { connectionString: config.uri };
  const client = new Ctor(clientConfig);
  await client.connect();
  return client;
}

function safeUriDatabase(uri: string): string {
  try {
    const u = new URL(uri);
    const path = u.pathname.replace(/^\/+/, '');
    return path || u.hostname;
  } catch {
    return 'database';
  }
}
