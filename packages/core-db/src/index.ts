import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database, { type Database as DatabaseInstance } from 'better-sqlite3';

const SCHEMA_VERSION = 1;

const MIGRATIONS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS schema_meta (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );`,
  `CREATE TABLE IF NOT EXISTS selftest_runs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     run_at TEXT NOT NULL,
     rules_version TEXT NOT NULL,
     fixtures_total INTEGER NOT NULL,
     fixtures_passed INTEGER NOT NULL,
     precision_pct REAL NOT NULL,
     recall_pct REAL NOT NULL,
     passed INTEGER NOT NULL
   );`,
  `CREATE TABLE IF NOT EXISTS update_history (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     applied_at TEXT NOT NULL,
     from_version TEXT NOT NULL,
     to_version TEXT NOT NULL,
     selftest_passed INTEGER NOT NULL,
     rolled_back INTEGER NOT NULL DEFAULT 0
   );`,
];

export function openDatabase(path: string): DatabaseInstance {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function migrate(db: DatabaseInstance): void {
  const tx = db.transaction(() => {
    for (const statement of MIGRATIONS) {
      db.exec(statement);
    }
    const setMeta = db.prepare('INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)');
    setMeta.run('schema_version', String(SCHEMA_VERSION));
  });
  tx();
}

export function getSchemaVersion(db: DatabaseInstance): number {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'")
    .get();
  if (!table) return 0;
  const row = db.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get() as
    | { value?: string }
    | undefined;
  if (!row || row.value === undefined) return 0;
  const n = Number.parseInt(row.value, 10);
  return Number.isFinite(n) ? n : 0;
}

export { SCHEMA_VERSION };
