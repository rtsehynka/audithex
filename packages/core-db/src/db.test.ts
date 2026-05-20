import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, getSchemaVersion, migrate, openDatabase } from './index.js';

let workDir: string;

describe('core-db migrations', () => {
  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'audithex-db-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('applies migrations and records the schema version', () => {
    const db = openDatabase(join(workDir, 'state.sqlite'));
    expect(getSchemaVersion(db)).toBe(0);
    migrate(db);
    expect(getSchemaVersion(db)).toBe(SCHEMA_VERSION);
    db.close();
  });

  it('creates the expected tables', () => {
    const db = openDatabase(join(workDir, 'state.sqlite'));
    migrate(db);
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    const names = rows.map((r) => r.name);
    expect(names).toContain('selftest_runs');
    expect(names).toContain('update_history');
    expect(names).toContain('schema_meta');
    db.close();
  });
});
