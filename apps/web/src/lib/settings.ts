import {
  type RulesPackUpdateDocument,
  countScanRuns,
  listRulesPackUpdates,
} from '@audithex/core-persistence';
import { getConnection } from './db';
import { loadWebEnv } from './env';

export interface SettingsSnapshot {
  audithex: { version: string };
  mongo: {
    uriDisplay: string;
    dbName: string;
    connected: boolean;
    scanCount: number | null;
    error?: string;
  };
  rulesPack: {
    sourceHint: string;
  };
  session: {
    ttlSeconds: number;
    cookieName: string;
  };
  recentUpdates: RulesPackUpdateDocument[];
}

// Hard-coded for now — the CLI ships the same constant. When the CLI
// publishes an SDK, this can be re-imported.
export const AUDITHEX_VERSION = '0.0.0-dev';

export async function loadSettingsSnapshot(): Promise<SettingsSnapshot> {
  const env = loadWebEnv();
  const ttl = env.AUDITHEX_UI_SESSION_TTL_SECONDS;
  const baseline: SettingsSnapshot = {
    audithex: { version: AUDITHEX_VERSION },
    mongo: {
      uriDisplay: maskUri(env.MONGODB_URI),
      dbName: extractDbName(env.MONGODB_URI),
      connected: false,
      scanCount: null,
    },
    rulesPack: {
      sourceHint: 'Edit ~/.audithex/rules-pack/ or rerun `audithex update` from the CLI.',
    },
    session: { ttlSeconds: ttl, cookieName: 'audithex_session' },
    recentUpdates: [],
  };

  try {
    const conn = await getConnection();
    const [scanCount, updates] = await Promise.all([
      countScanRuns(conn),
      listRulesPackUpdates(conn, 5),
    ]);
    return {
      ...baseline,
      mongo: { ...baseline.mongo, connected: true, scanCount },
      recentUpdates: updates,
    };
  } catch (err) {
    return {
      ...baseline,
      mongo: {
        ...baseline.mongo,
        connected: false,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

function maskUri(uri: string): string {
  try {
    const u = new URL(uri);
    if (u.password) u.password = '***';
    if (u.username) u.username = '***';
    return u.toString();
  } catch {
    return uri.replace(/:[^@/]+@/, ':***@');
  }
}

function extractDbName(uri: string): string {
  try {
    const u = new URL(uri);
    const path = u.pathname.replace(/^\//, '');
    return path || 'test';
  } catch {
    return 'unknown';
  }
}
