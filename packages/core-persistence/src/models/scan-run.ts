import type { Finding, ScanKind, ScanResult, Severity } from '@audithex/core-types';
import type { Connection, Model } from 'mongoose';
import { Schema } from 'mongoose';

/**
 * Mongoose model for a single `audithex scan` invocation. Mirrors
 * `ScanResult` from `@audithex/core-types` plus a `userId` foreign key
 * for the eventual single-user UI. The same document shape ships out
 * of CLI scans today and into the web UI later without a migration.
 */
export interface ScanRunDocument {
  _id?: string;
  userId?: string | null;
  /** Optional foreign key to a Project (null for ad-hoc scans). */
  projectId?: string | null;
  rootPath: string;
  scannedAt: string;
  discovery: ScanResult['discovery'];
  findings: Finding[];
  rulesVersion: string;
  audithexVersion: string;
  elapsedMs: number;
  /** Most severe severity present in `findings`, for fast list filtering. */
  topSeverity: Severity | 'none';
  /** Hex-encoded sha256 of the report JSON, for dedupe across re-runs. */
  fingerprint: string;
  /**
   * Which kind of scan produced this run. Static = file-based; dynamic
   * = live-LLM attack. Defaults to 'static' so pre-existing rows read
   * back without migration.
   */
  scanType?: ScanKind;
  /**
   * Budget snapshot for dynamic scans. Absent on static runs.
   */
  dynamicScanBudget?: {
    maxUsd: number;
    spentUsd: number;
    exhausted: boolean;
  } | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const CodeSnippetSchema = new Schema(
  {
    startLine: { type: Number, required: true },
    focusLine: { type: Number, required: true },
    lines: { type: [String], default: [] },
  },
  { _id: false },
);

/**
 * Finding subdocument. Carries both static (`file`, `line`) and dynamic
 * (`payloadId`, `prompt`, `response`, `judgeReason`) fields side-by-side,
 * with `kind` discriminating. The TypeScript `Finding` union enforces
 * which fields are required per kind at the application layer; the
 * Mongoose schema stores a superset and stays untyped at the generic
 * slot (Mongoose's `Schema<T>` cannot express a discriminated union of
 * subdocuments without the `Discriminator` pattern, which complicates
 * unrelated reads).
 */
const FindingSchema = new Schema(
  {
    kind: { type: String, enum: ['static', 'dynamic'], default: 'static', required: true },
    ruleId: { type: String, required: true, index: true },
    severity: { type: String, required: true, index: true },
    owasp: { type: [String], default: [] },
    cwe: { type: String },
    blockId: { type: String, required: true, index: true },
    location: {
      file: { type: String },
      line: { type: Number },
      column: { type: Number },
      endLine: { type: Number },
      endColumn: { type: Number },
    },
    messageKey: { type: String, required: true },
    messageParams: { type: Schema.Types.Mixed },
    rationaleKey: { type: String, required: true },
    rationaleParams: { type: Schema.Types.Mixed },
    fixKey: { type: String, required: true },
    fixParams: { type: Schema.Types.Mixed },
    codeSnippet: { type: CodeSnippetSchema, default: undefined },
    // Dynamic-only fields. Present only on `kind === 'dynamic'` findings.
    payloadId: { type: String },
    payloadCategory: { type: String },
    prompt: { type: String },
    response: { type: String },
    judgeReason: { type: String },
    tokensUsed: {
      input: { type: Number },
      output: { type: Number },
    },
    costUsd: { type: Number },
  },
  { _id: false },
);

const DynamicScanBudgetSchema = new Schema(
  {
    maxUsd: { type: Number, required: true },
    spentUsd: { type: Number, required: true },
    exhausted: { type: Boolean, required: true },
  },
  { _id: false },
);

const DiscoverySummarySchema = new Schema(
  {
    totalFiles: { type: Number, required: true },
    byExtension: { type: Schema.Types.Mixed, default: {} },
    envFiles: { type: Number, required: true },
    skippedByGitignore: { type: Number, required: true },
    elapsedMs: { type: Number, required: true },
  },
  { _id: false },
);

const ScanRunSchema = new Schema<ScanRunDocument>(
  {
    userId: { type: String, default: null, index: true },
    projectId: { type: String, default: null, index: true },
    rootPath: { type: String, required: true, index: true },
    scannedAt: { type: String, required: true },
    discovery: { type: DiscoverySummarySchema, required: true },
    findings: { type: [FindingSchema], default: [] },
    rulesVersion: { type: String, required: true },
    audithexVersion: { type: String, required: true },
    elapsedMs: { type: Number, required: true },
    topSeverity: { type: String, required: true, index: true },
    fingerprint: { type: String, required: true, index: true },
    scanType: { type: String, enum: ['static', 'dynamic'], default: 'static', index: true },
    dynamicScanBudget: { type: DynamicScanBudgetSchema, default: null },
  },
  { timestamps: true, collection: 'scan_runs' },
);

ScanRunSchema.index({ createdAt: -1 });
ScanRunSchema.index({ rootPath: 1, createdAt: -1 });
ScanRunSchema.index({ projectId: 1, createdAt: -1 });

export function getScanRunModel(connection: Connection): Model<ScanRunDocument> {
  const existing = connection.models.ScanRun as Model<ScanRunDocument> | undefined;
  if (existing) return existing;
  return connection.model<ScanRunDocument>('ScanRun', ScanRunSchema);
}
