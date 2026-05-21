import type { Finding, ScanResult, Severity } from '@audithex/core-types';
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
  createdAt?: Date;
  updatedAt?: Date;
}

const FindingSchema = new Schema<Finding>(
  {
    ruleId: { type: String, required: true, index: true },
    severity: { type: String, required: true, index: true },
    owasp: { type: [String], default: [] },
    cwe: { type: String },
    location: {
      file: { type: String, required: true },
      line: { type: Number, required: true },
      column: { type: Number },
      endLine: { type: Number },
      endColumn: { type: Number },
    },
    messageKey: { type: String, required: true },
    messageParams: { type: Schema.Types.Mixed },
    fixKey: { type: String, required: true },
    fixParams: { type: Schema.Types.Mixed },
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
