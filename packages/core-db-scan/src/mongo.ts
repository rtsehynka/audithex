import type { Finding } from '@audithex/core-types';
import { MongoClient } from 'mongodb';
import { type SecretRule, matchValueIntoFindings, safeUriDatabase } from './shared.js';

/**
 * MongoDB scanner. Walks the requested collections, samples the first
 * `rowLimit` documents from each, and runs the secret-pattern rules
 * against every string-valued field encountered while flattening the
 * document. Findings carry a
 * `db://<database>/<collection>?id=<_id>&field=<dotted.path>` location.
 *
 * Object / array nesting is walked recursively. Buffer / Binary fields
 * are skipped (not text). The `_id` is stringified — works for the
 * default ObjectId, UUID strings, or any custom id shape.
 */

export interface MongoConnectionConfig {
  driver: 'mongodb';
  uri: string;
  database?: string | null;
}

export interface ScanMongoArgs {
  connection: MongoConnectionConfig;
  /** Specific collection names to scan. */
  collections: readonly string[];
  scanAll: boolean;
  rowLimit: number;
  rules: readonly SecretRule[];
  onCollectionScanned?: (e: {
    collection: string;
    rowsScanned: number;
    findingsAdded: number;
    index: number;
    total: number;
  }) => void;
}

export interface MongoScanOutcome {
  findings: Finding[];
  collectionsScanned: string[];
  rowsScanned: number;
}

export async function scanMongo(args: ScanMongoArgs): Promise<MongoScanOutcome> {
  const client = new MongoClient(args.connection.uri);
  await client.connect();
  try {
    const dbName = args.connection.database ?? safeUriDatabase(args.connection.uri);
    const db = client.db(dbName);

    const collections =
      args.collections.length > 0 ? [...args.collections] : await listCollections(db);

    const findings: Finding[] = [];
    let totalRows = 0;
    for (let i = 0; i < collections.length; i += 1) {
      const collection = collections[i] as string;
      const before = findings.length;
      const rows = await scanCollection({
        db,
        collection,
        rowLimit: args.rowLimit,
        databaseLabel: dbName,
        rules: args.rules,
        findings,
      });
      totalRows += rows;
      args.onCollectionScanned?.({
        collection,
        rowsScanned: rows,
        findingsAdded: findings.length - before,
        index: i + 1,
        total: collections.length,
      });
    }
    return { findings, collectionsScanned: collections, rowsScanned: totalRows };
  } finally {
    await client.close();
  }
}

export async function probeMongo(
  config: MongoConnectionConfig,
): Promise<{ ok: boolean; message?: string; collections: string[] }> {
  const client = new MongoClient(config.uri);
  try {
    await client.connect();
    const dbName = config.database ?? safeUriDatabase(config.uri);
    const collections = await listCollections(client.db(dbName));
    return { ok: true, collections };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      collections: [],
    };
  } finally {
    await client.close().catch(() => {});
  }
}

async function listCollections(db: ReturnType<MongoClient['db']>): Promise<string[]> {
  const list = await db.listCollections({ type: 'collection' }, { nameOnly: true }).toArray();
  return list
    .map((c) => c.name as string)
    .filter((n) => !n.startsWith('system.'))
    .sort();
}

async function scanCollection(args: {
  db: ReturnType<MongoClient['db']>;
  collection: string;
  rowLimit: number;
  databaseLabel: string;
  rules: readonly SecretRule[];
  findings: Finding[];
}): Promise<number> {
  const cursor = args.db.collection(args.collection).find({}, { limit: args.rowLimit });
  let rowIndex = 0;
  for await (const doc of cursor) {
    rowIndex += 1;
    const docId = String((doc as { _id?: unknown })._id ?? rowIndex);
    walkValue(doc, '', (value, dottedPath) => {
      matchValueIntoFindings({
        value,
        rules: args.rules,
        locationFile: `db://${args.databaseLabel}/${args.collection}?id=${encodeURIComponent(docId)}&field=${encodeURIComponent(dottedPath)}`,
        positionIndex: rowIndex,
        out: args.findings,
      });
    });
  }
  return rowIndex;
}

/**
 * Flattens object / array values into a sequence of (stringValue,
 * dottedPath) pairs. Skips `_id` (it's already the row key) and any
 * `Binary` / `Buffer` shapes — they aren't text. Depth is bounded
 * by the document itself; Mongo docs cap at 16 MB so recursion can't
 * blow the stack.
 */
function walkValue(value: unknown, path: string, emit: (s: string, p: string) => void): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    if (path === '_id') return;
    emit(value, path);
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return;
  if (value instanceof Date) return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      walkValue(value[i], path ? `${path}[${i}]` : `[${i}]`, emit);
    }
    return;
  }
  if (typeof value === 'object') {
    // Skip BSON-binary / Buffer-ish shapes.
    const o = value as Record<string, unknown>;
    if (typeof o._bsontype === 'string' || o instanceof Uint8Array) return;
    for (const key of Object.keys(o)) {
      if (key === '_id' && path === '') continue;
      walkValue(o[key], path ? `${path}.${key}` : key, emit);
    }
  }
}
