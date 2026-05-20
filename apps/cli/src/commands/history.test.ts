import { join } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { locateFixturesRoot, runCli } from '../test-helpers/cli-runner.js';

/**
 * Spawns the built CLI against an in-memory MongoDB so we exercise the
 * same persist + read flow a real user gets. Verifies the env-gating
 * (`MONGODB_URI` required), the list + JSON output, and the --show
 * detail rendering.
 */

describe('audithex history command (MongoDB-backed)', () => {
  let mongo: MongoMemoryServer;
  let baseEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    baseEnv = { ...process.env, MONGODB_URI: mongo.getUri() };
  }, 90_000);

  afterAll(async () => {
    await mongo.stop();
  });

  it('exits 2 when MONGODB_URI is missing', () => {
    const env = { ...process.env, MONGODB_URI: '' };
    const result = runCli(['history'], env);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/MONGODB_URI/);
  });

  it('reports an empty history before any scan has been persisted', () => {
    const result = runCli(['history'], baseEnv);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/No scan runs found/);
  });

  it('persists a scan and lists it back through `history`', () => {
    const fixture = join(locateFixturesRoot(), 'fixture-banking-bot');

    const scan = runCli(['scan', fixture], baseEnv);
    expect(scan.status).toBe(2);
    expect(scan.stdout).toMatch(/Saved scan run/);

    const list = runCli(['history'], baseEnv);
    expect(list.status).toBe(0);
    expect(list.stdout).toMatch(/Found 1 scan run/);
    expect(list.stdout).toMatch(/critical/);

    const jsonList = JSON.parse(runCli(['history', '--json'], baseEnv).stdout) as {
      total: number;
      runs: Array<{ _id: string; topSeverity: string }>;
    };
    expect(jsonList.total).toBe(1);
    expect(jsonList.runs[0]?.topSeverity).toBe('critical');

    const id = jsonList.runs[0]?._id ?? '';
    const detail = runCli(['history', '--show', id], baseEnv);
    expect(detail.status).toBe(0);
    expect(detail.stdout).toMatch(new RegExp(id));
    expect(detail.stdout).toMatch(/topSeverity critical/);
    expect(detail.stdout).toMatch(/critical=5/);
  }, 60_000);

  it('returns 2 when --show points at an unknown id', () => {
    const result = runCli(['history', '--show', '000000000000000000000000'], baseEnv);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/No scan run/);
  });
});
