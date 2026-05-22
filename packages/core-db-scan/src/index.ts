import type { Finding, RulesPack } from '@audithex/core-types';
import { type MongoConnectionConfig, scanMongo } from './mongo.js';
import { type MysqlClientFactory, type MysqlConnectionConfig, scanMysql } from './mysql.js';
import { type PgClientCtor, type PgConnectionConfig, scanPostgres } from './postgres.js';
import { indexSecretRules } from './shared.js';

/**
 * RAG / operational database scanner. The orchestration in apps/cli +
 * apps/web is driver-agnostic; this module is the only place that
 * knows about dialect-specific bits (Postgres tables vs Mongo
 * collections, SQL information_schema vs `db.listCollections()`,
 * row-iteration shape).
 *
 * Findings carry a synthetic `db://<database>/<table-or-collection>?...`
 * location so the existing report / persistence / PDF / diff layers
 * treat them like any other finding.
 *
 * Driver list:
 *   - `postgres` — text/varchar/json/jsonb columns
 *   - `mysql`    — char/varchar/text/json columns
 *   - `mongodb`  — string fields walked recursively through every
 *                  document in the selected collections
 */

export type DbConnectionConfig = PgConnectionConfig | MysqlConnectionConfig | MongoConnectionConfig;

export interface DbScanOptions {
  connection: DbConnectionConfig;
  rulesPack: RulesPack;
  /** Specific tables / collections to scan. */
  tables: readonly string[];
  /**
   * Walk every table / collection the user can see. Off by default —
   * opt-in only, because walking every table / collection on every
   * scan is overhead and usually not what the user wants.
   */
  scanAllTables: boolean;
  /** Max rows / documents sampled per table. Default 500. */
  rowLimit?: number;
  /**
   * Optional progress callback. Fired once per table / collection
   * after it's been fully scanned.
   */
  onTableScanned?: (event: DbTableScanEvent) => void;
  /**
   * Optional Postgres Client constructor injection point. Used by
   * tests to pass pg-mem's adapter in lieu of a real Postgres. Has
   * no effect on the mysql / mongodb drivers.
   */
  clientFactory?: PgClientCtor;
  /**
   * Optional MySQL connection factory injection point. Tests provide
   * an in-process implementation so we don't need a real MySQL daemon
   * (mysql-mem doesn't exist; same pattern as `clientFactory` for pg).
   */
  mysqlClientFactory?: MysqlClientFactory;
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
  if (options.tables.length === 0 && !options.scanAllTables) {
    throw new Error(
      'No tables selected and scanAllTables is disabled — refusing to walk the full database without an explicit opt-in.',
    );
  }

  const startedAt = Date.now();
  const rules = indexSecretRules(options.rulesPack);
  const rowLimit = options.rowLimit ?? DEFAULT_ROW_LIMIT;

  if (options.connection.driver === 'postgres') {
    const outcome = await scanPostgres({
      connection: options.connection,
      tables: options.tables,
      scanAllTables: options.scanAllTables,
      rowLimit,
      rules,
      ...(options.clientFactory ? { clientFactory: options.clientFactory } : {}),
      ...(options.onTableScanned ? { onTableScanned: options.onTableScanned } : {}),
    });
    return {
      findings: outcome.findings,
      tablesScanned: outcome.tablesScanned,
      rowsScanned: outcome.rowsScanned,
      elapsedMs: Date.now() - startedAt,
    };
  }

  if (options.connection.driver === 'mysql') {
    const outcome = await scanMysql({
      connection: options.connection,
      tables: options.tables,
      scanAllTables: options.scanAllTables,
      rowLimit,
      rules,
      ...(options.mysqlClientFactory ? { clientFactory: options.mysqlClientFactory } : {}),
      ...(options.onTableScanned ? { onTableScanned: options.onTableScanned } : {}),
    });
    return {
      findings: outcome.findings,
      tablesScanned: outcome.tablesScanned,
      rowsScanned: outcome.rowsScanned,
      elapsedMs: Date.now() - startedAt,
    };
  }

  if (options.connection.driver === 'mongodb') {
    const outcome = await scanMongo({
      connection: options.connection,
      collections: options.tables,
      scanAll: options.scanAllTables,
      rowLimit,
      rules,
      ...(options.onTableScanned
        ? {
            onCollectionScanned: (e) =>
              options.onTableScanned?.({
                table: e.collection,
                rowsScanned: e.rowsScanned,
                findingsAdded: e.findingsAdded,
                index: e.index,
                total: e.total,
              }),
          }
        : {}),
    });
    return {
      findings: outcome.findings,
      tablesScanned: outcome.collectionsScanned,
      rowsScanned: outcome.rowsScanned,
      elapsedMs: Date.now() - startedAt,
    };
  }

  // Unreachable per the discriminated union, but keep the runtime
  // guard so callers that bypass the type system still get a
  // recognisable error instead of a silent no-op.
  const driver = (options.connection as { driver: string }).driver;
  throw new Error(`Unsupported db driver: ${driver}`);
}

export { probePostgres, listUserTables } from './postgres.js';
export { probeMongo } from './mongo.js';
export { probeMysql } from './mysql.js';
export type { PgClientCtor, PgConnectionConfig } from './postgres.js';
export type { MongoConnectionConfig } from './mongo.js';
export type { MysqlConnectionConfig, MysqlClientFactory, MysqlClientLike } from './mysql.js';
