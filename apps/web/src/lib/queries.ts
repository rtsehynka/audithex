import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
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
  projectId: string | null;
  projectName: string | null;
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
  codeSnippet?: {
    startLine: number;
    focusLine: number;
    lines: string[];
  };
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
  const [docs, total, projectIndex] = await Promise.all([
    fetchScanRuns(conn, { limit, skip, ...(rootPath ? { rootPath } : {}) }),
    countScanRuns(conn),
    listProjectsIndexedById(),
  ]);
  return {
    runs: docs.map((d) => toSummary(d, projectIndex)),
    total,
    limit,
    skip,
  };
}

async function listProjectsIndexedById(): Promise<Map<string, string>> {
  const { listProjects } = await import('@audithex/core-persistence');
  const conn = await getConnection();
  const docs = await listProjects(conn);
  const idx = new Map<string, string>();
  for (const d of docs) idx.set(String(d._id), d.name);
  return idx;
}

export interface ScanComparisonOption {
  id: string;
  label: string;
}

/**
 * Returns the most recent N scan runs other than `excludeId`, used to
 * populate the "Diff vs…" picker on the scan-detail page.
 */
export async function listComparisonOptions({
  excludeId,
  limit = 25,
}: {
  excludeId: string;
  limit?: number;
}): Promise<ScanComparisonOption[]> {
  const conn = await getConnection();
  const docs = await fetchScanRuns(conn, { limit: limit + 1 });
  return docs
    .filter((d) => String(d._id) !== excludeId)
    .slice(0, limit)
    .map((d) => ({
      id: String(d._id),
      label: `${String(d._id).slice(0, 8)}… · ${d.scannedAt.slice(0, 16).replace('T', ' ')} · ${d.findings.length} findings`,
    }));
}

export async function getScan(id: string): Promise<ScanRunDetail | null> {
  if (!isObjectIdLike(id)) return null;
  const conn = await getConnection();
  const doc = await fetchScanRunById(conn, id);
  if (!doc) return null;
  const projectIndex = await listProjectsIndexedById();
  const summary = toSummary(doc, projectIndex);
  return {
    ...summary,
    audithexVersion: doc.audithexVersion,
    fingerprint: doc.fingerprint,
    discovery: doc.discovery,
    findings: doc.findings.map((f) => {
      const snippet = f.codeSnippet
        ? {
            startLine: f.codeSnippet.startLine,
            focusLine: f.codeSnippet.focusLine,
            lines: [...f.codeSnippet.lines],
          }
        : reReadSnippet(doc.rootPath, f.location.file, f.location.line);
      return {
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
        ...(snippet ? { codeSnippet: snippet } : {}),
      };
    }),
  };
}

/**
 * Fallback: if a finding was persisted without a codeSnippet (older
 * scan written before U12, or a save that dropped the field), re-read
 * the source file off disk at request time. Cached per request via
 * the simple module-level Map so a scan with N findings in the same
 * file only reads it once.
 *
 * Skips synthetic db:// locations and any file we can't open. The
 * scan-detail page renders the snippet conditionally, so a missing
 * one is invisible to the user — not an error.
 */
const RE_READ_CONTEXT = 3;
const RE_READ_MAX_LINE_BYTES = 800;

function reReadSnippet(
  rootPath: string,
  fileRef: string,
  focusLine: number,
): { startLine: number; focusLine: number; lines: string[] } | undefined {
  if (!fileRef || fileRef.startsWith('db://')) return undefined;
  const absolute = isAbsolute(fileRef) ? fileRef : join(rootPath, fileRef);
  let content: string;
  try {
    content = readFileSync(absolute, 'utf8');
  } catch {
    return undefined;
  }
  const lines = content.split(/\r?\n/);
  const focus = Math.max(1, focusLine);
  const startLine = Math.max(1, focus - RE_READ_CONTEXT);
  const endLine = Math.min(lines.length, focus + RE_READ_CONTEXT);
  if (startLine > endLine) return undefined;
  const slice = lines
    .slice(startLine - 1, endLine)
    .map((l) => (l.length > RE_READ_MAX_LINE_BYTES ? `${l.slice(0, RE_READ_MAX_LINE_BYTES)}…` : l));
  return { startLine, focusLine: focus, lines: slice };
}

function toSummary(
  doc: ScanRunDocument,
  projectIndex: ReadonlyMap<string, string>,
): ScanRunSummary {
  const projectId = doc.projectId ?? null;
  const projectName = projectId ? (projectIndex.get(projectId) ?? null) : null;
  return toScanRunSummary(doc, projectName);
}

/**
 * Plain-object projection of a Mongo ScanRun. Exported so per-project
 * pages can reuse the exact same shape without re-implementing the
 * counts + ISO normalisation rules (which is what jscpd flagged).
 */
export function toScanRunSummary(doc: ScanRunDocument, projectName: string | null): ScanRunSummary {
  return {
    id: String(doc._id),
    rootPath: doc.rootPath,
    scannedAt: doc.scannedAt,
    topSeverity: doc.topSeverity,
    rulesVersion: doc.rulesVersion,
    elapsedMs: doc.elapsedMs,
    severityCounts: countBySeverity(doc.findings),
    totalFindings: doc.findings.length,
    createdAt: doc.createdAt ? doc.createdAt.toISOString() : doc.scannedAt,
    projectId: doc.projectId ?? null,
    projectName,
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
