import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface RulesPackManifest {
  schemaVersion: '0.1';
  version: string;
  releasedAt: string;
  ruleIds: string[];
  checksumSha256: string;
}

export interface UpdateCheckResult {
  current: string;
  latest: string;
  upToDate: boolean;
}

export const BUNDLED_RULES_VERSION = '0.0.1-dev';

export function audithexHome(): string {
  if (process.env.AUDITHEX_HOME) {
    return process.env.AUDITHEX_HOME;
  }
  return join(homedir(), '.audithex');
}

export function manifestPath(): string {
  return join(audithexHome(), 'rules-pack', 'manifest.json');
}

export function readLocalManifest(): RulesPackManifest | null {
  try {
    const raw = readFileSync(manifestPath(), 'utf8');
    return JSON.parse(raw) as RulesPackManifest;
  } catch {
    return null;
  }
}

export function writeLocalManifest(manifest: RulesPackManifest): void {
  const path = manifestPath();
  mkdirSync(join(audithexHome(), 'rules-pack'), { recursive: true });
  writeFileSync(path, JSON.stringify(manifest, null, 2), 'utf8');
}

export function compareSemver(a: string, b: string): number {
  const stripPrerelease = (s: string): number[] => {
    const base = s.split('-')[0] ?? s;
    return base.split('.').map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
  };
  const aa = stripPrerelease(a);
  const bb = stripPrerelease(b);
  const length = Math.max(aa.length, bb.length);
  for (let i = 0; i < length; i += 1) {
    const av = aa[i] ?? 0;
    const bv = bb[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

export function evaluateUpdate(current: string, latest: string): UpdateCheckResult {
  return {
    current,
    latest,
    upToDate: compareSemver(current, latest) >= 0,
  };
}
