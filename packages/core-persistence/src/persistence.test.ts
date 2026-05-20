import type { Finding, ScanResult } from '@audithex/core-types';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Connection } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './auth.js';
import { connectMongo, disconnectAll } from './connect.js';
import { getScanRunModel } from './models/scan-run.js';
import { getUserModel } from './models/user.js';
import {
  computeTopSeverity,
  countScanRuns,
  createUser,
  findUserByEmail,
  fingerprintScanResult,
  getScanRunById,
  listRulesPackUpdates,
  listScanRuns,
  logRulesPackUpdate,
  saveScanRun,
} from './repository.js';

let mongo: MongoMemoryServer;
let conn: Connection;
let uri: string;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  uri = mongo.getUri();
  conn = await connectMongo(uri);
}, 60_000);

afterAll(async () => {
  await disconnectAll();
  await mongo.stop();
});

afterEach(async () => {
  await getScanRunModel(conn).deleteMany({});
  await getUserModel(conn).deleteMany({});
});

function fakeFinding(severity: Finding['severity'], file: string, line: number): Finding {
  return {
    ruleId: 'R001',
    severity,
    owasp: ['LLM06'],
    location: { file, line },
    messageKey: 'findings:R001.message',
    fixKey: 'findings:R001.fix',
  };
}

function fakeScan(rootPath: string, findings: Finding[]): ScanResult {
  return {
    rootPath,
    scannedAt: '2026-05-20T15:00:00.000Z',
    discovery: {
      totalFiles: 10,
      byExtension: { '.ts': 8, '.md': 2 },
      envFiles: 0,
      skippedByGitignore: 0,
      elapsedMs: 12,
    },
    findings,
    rulesVersion: '0.1.0 (bundled)',
    audithexVersion: '0.0.0-dev',
    elapsedMs: 25,
  };
}

describe('computeTopSeverity', () => {
  it('returns the highest-ranked severity', () => {
    expect(computeTopSeverity([])).toBe('none');
    expect(
      computeTopSeverity([fakeFinding('low', 'a.ts', 1), fakeFinding('critical', 'b.ts', 2)]),
    ).toBe('critical');
    expect(computeTopSeverity([fakeFinding('medium', 'a.ts', 1)])).toBe('medium');
  });
});

describe('fingerprintScanResult', () => {
  it('is stable for the same findings and unstable when findings change', () => {
    const a = fakeScan('/root', [fakeFinding('high', 'a.ts', 1)]);
    const b = fakeScan('/root', [fakeFinding('high', 'a.ts', 1)]);
    expect(fingerprintScanResult(a)).toBe(fingerprintScanResult(b));
    const c = fakeScan('/root', [fakeFinding('high', 'a.ts', 2)]);
    expect(fingerprintScanResult(a)).not.toBe(fingerprintScanResult(c));
  });
});

describe('saveScanRun + listScanRuns', () => {
  it('persists a scan and lists it back ordered by createdAt desc', async () => {
    const first = await saveScanRun(conn, {
      scan: fakeScan('/repo-a', [fakeFinding('low', 'a.ts', 1)]),
    });
    const second = await saveScanRun(conn, {
      scan: fakeScan('/repo-b', [fakeFinding('critical', 'b.ts', 2)]),
    });

    const list = await listScanRuns(conn);
    expect(list).toHaveLength(2);
    expect(String(list[0]?._id)).toBe(String(second._id));
    expect(String(list[1]?._id)).toBe(String(first._id));
    expect(list[0]?.topSeverity).toBe('critical');
    expect(list[1]?.topSeverity).toBe('low');
  });

  it('filters by rootPath', async () => {
    await saveScanRun(conn, { scan: fakeScan('/repo-a', []) });
    await saveScanRun(conn, { scan: fakeScan('/repo-b', []) });
    const list = await listScanRuns(conn, { rootPath: '/repo-a' });
    expect(list).toHaveLength(1);
    expect(list[0]?.rootPath).toBe('/repo-a');
  });

  it('respects limit + skip pagination', async () => {
    for (let i = 0; i < 5; i += 1) {
      await saveScanRun(conn, { scan: fakeScan(`/r${i}`, []) });
    }
    const page1 = await listScanRuns(conn, { limit: 2 });
    expect(page1).toHaveLength(2);
    const page2 = await listScanRuns(conn, { limit: 2, skip: 2 });
    expect(page2).toHaveLength(2);
    expect(String(page1[0]?._id)).not.toBe(String(page2[0]?._id));
  });

  it('countScanRuns returns the document count', async () => {
    for (let i = 0; i < 3; i += 1) {
      await saveScanRun(conn, { scan: fakeScan(`/r${i}`, []) });
    }
    expect(await countScanRuns(conn)).toBe(3);
  });

  it('getScanRunById round-trips a saved document', async () => {
    const saved = await saveScanRun(conn, {
      scan: fakeScan('/repo', [fakeFinding('high', 'x.ts', 1)]),
    });
    const fetched = await getScanRunById(conn, String(saved._id));
    expect(fetched).not.toBeNull();
    expect(fetched?.rootPath).toBe('/repo');
    expect(fetched?.findings).toHaveLength(1);
    expect(fetched?.topSeverity).toBe('high');
  });
});

describe('users + auth', () => {
  it('hashes a password and verifies it', async () => {
    const hash = await hashPassword('correct horse battery staple', 4);
    expect(hash).not.toBe('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong password value', hash)).toBe(false);
  });

  it('rejects short passwords at hash time', async () => {
    await expect(hashPassword('short', 4)).rejects.toThrow(/at least 8/);
  });

  it('createUser + findUserByEmail are case-insensitive', async () => {
    const hash = await hashPassword('correct horse battery staple', 4);
    await createUser(conn, { email: 'Roman@Audithex.LOCAL', passwordHash: hash });
    const found = await findUserByEmail(conn, 'roman@audithex.local');
    expect(found?.email).toBe('roman@audithex.local');
  });
});

describe('logRulesPackUpdate', () => {
  it('records an update outcome and lists it back', async () => {
    await logRulesPackUpdate(conn, {
      outcome: 'installed',
      fromCommit: null,
      toCommit: 'abc123',
      fromVersion: null,
      toVersion: '0.1.0',
    });
    await logRulesPackUpdate(conn, {
      outcome: 'rolled-back',
      fromCommit: 'abc123',
      toCommit: 'def456',
      fromVersion: '0.1.0',
      toVersion: '0.2.0',
      reason: 'selftest failed on new pack',
    });
    const list = await listRulesPackUpdates(conn);
    expect(list).toHaveLength(2);
    expect(list[0]?.outcome).toBe('rolled-back');
    expect(list[0]?.reason).toBe('selftest failed on new pack');
  });
});
