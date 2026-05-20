import {
  type ScanRunDocument,
  countScanRuns,
  getScanRunById as fetchScanRunById,
  listScanRuns as fetchScanRuns,
} from '@audithex/core-persistence';
import { getConnection } from './db';

/**
 * UI-facing data shape: never expose raw Mongoose documents to React;
 * always pass a plain serialisable object so React Server Components
 * can transit it across the server/client boundary.
 */
export interface ScanRunSummary {
  id: string;
  rootPath: string;
  scannedAt: string;
  topSeverity: ScanRunDocument['topSeverity'];
  rulesVersion: string;
  elapsedMs: number;
  severityCounts: SeverityCounts;
  totalFindings: number;
  createdAt: string;
}

export interface ScanRunDetail extends ScanRunSummary {
  audithexVersion: string;
  fingerprint: string;
  discovery: ScanRunDocument['discovery'];
  findings: SerializableFinding[];
}

export interface SerializableFinding {
  ruleId: string;
  severity: ScanRunDocument['findings'][number]['severity'];
  owasp: string[];
  cwe?: string;
  file: string;
  line: number;
  column?: number;
  messageKey: string;
  messageParams?: Record<string, string | number>;
  fixKey: string;
}

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface ListScansResult {
  runs: ScanRunSummary[];
  total: number;
  limit: number;
  skip: number;
}

const DEFAULT_LIMIT = 25;

export async function listScans({
  limit = DEFAULT_LIMIT,
  skip = 0,
  rootPath,
}: {
  limit?: number;
  skip?: number;
  rootPath?: string;
} = {}): Promise<ListScansResult> {
  const conn = await getConnection();
  const [docs, total] = await Promise.all([
    fetchScanRuns(conn, { limit, skip, ...(rootPath ? { rootPath } : {}) }),
    countScanRuns(conn),
  ]);
  return {
    runs: docs.map(toSummary),
    total,
    limit,
    skip,
  };
}

export async function getScan(id: string): Promise<ScanRunDetail | null> {
  if (!isObjectIdLike(id)) return null;
  const conn = await getConnection();
  const doc = await fetchScanRunById(conn, id);
  if (!doc) return null;
  const summary = toSummary(doc);
  return {
    ...summary,
    audithexVersion: doc.audithexVersion,
    fingerprint: doc.fingerprint,
    discovery: doc.discovery,
    findings: doc.findings.map((f) => ({
      ruleId: f.ruleId,
      severity: f.severity,
      owasp: [...f.owasp],
      ...(f.cwe ? { cwe: f.cwe } : {}),
      file: f.location.file,
      line: f.location.line,
      ...(typeof f.location.column === 'number' ? { column: f.location.column } : {}),
      messageKey: f.messageKey,
      ...(f.messageParams ? { messageParams: { ...f.messageParams } } : {}),
      fixKey: f.fixKey,
    })),
  };
}

function toSummary(doc: ScanRunDocument): ScanRunSummary {
  const counts = countBySeverity(doc.findings);
  return {
    id: String(doc._id),
    rootPath: doc.rootPath,
    scannedAt: doc.scannedAt,
    topSeverity: doc.topSeverity,
    rulesVersion: doc.rulesVersion,
    elapsedMs: doc.elapsedMs,
    severityCounts: counts,
    totalFindings: doc.findings.length,
    createdAt: doc.createdAt ? doc.createdAt.toISOString() : doc.scannedAt,
  };
}

function countBySeverity(findings: ScanRunDocument['findings']): SeverityCounts {
  const out: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    if (f.severity in out) {
      out[f.severity as keyof SeverityCounts] += 1;
    }
  }
  return out;
}

function isObjectIdLike(s: string): boolean {
  return /^[a-f0-9]{24}$/i.test(s);
}
