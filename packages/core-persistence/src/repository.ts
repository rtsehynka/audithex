import { createHash } from 'node:crypto';
import type { Finding, ScanResult, Severity } from '@audithex/core-types';
import type { Connection } from 'mongoose';
import { type AiFixDocument, getAiFixModel } from './models/ai-fix.js';
import {
  type RulesPackUpdateDocument,
  type UpdateOutcomeKind,
  getRulesPackUpdateModel,
} from './models/rules-pack-update.js';
import { type ScanRunDocument, getScanRunModel } from './models/scan-run.js';
import { type UserDocument, getUserModel } from './models/user.js';

/**
 * High-level data accessors so callers (CLI commands, web UI server
 * actions) never reach into raw Mongoose models. Every function takes
 * an explicit Connection — no module-level singleton — so tests using
 * mongodb-memory-server stay isolated.
 */

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function computeTopSeverity(findings: readonly Finding[]): Severity | 'none' {
  let best: Severity | 'none' = 'none';
  let bestRank = 0;
  for (const f of findings) {
    const rank = SEVERITY_RANK[f.severity] ?? 0;
    if (rank > bestRank) {
      bestRank = rank;
      best = f.severity;
    }
  }
  return best;
}

export function fingerprintScanResult(result: ScanResult): string {
  const payload = JSON.stringify({
    rootPath: result.rootPath,
    rulesVersion: result.rulesVersion,
    findings: result.findings.map((f) => ({
      ruleId: f.ruleId,
      severity: f.severity,
      file: f.location.file,
      line: f.location.line,
      messageKey: f.messageKey,
    })),
  });
  return createHash('sha256').update(payload).digest('hex');
}

export interface SaveScanRunInput {
  scan: ScanResult;
  userId?: string | null;
}

export async function saveScanRun(
  connection: Connection,
  input: SaveScanRunInput,
): Promise<ScanRunDocument> {
  const Model = getScanRunModel(connection);
  const doc: Partial<ScanRunDocument> = {
    userId: input.userId ?? null,
    rootPath: input.scan.rootPath,
    scannedAt: input.scan.scannedAt,
    discovery: input.scan.discovery,
    findings: input.scan.findings as Finding[],
    rulesVersion: input.scan.rulesVersion,
    audithexVersion: input.scan.audithexVersion,
    elapsedMs: input.scan.elapsedMs,
    topSeverity: computeTopSeverity(input.scan.findings),
    fingerprint: fingerprintScanResult(input.scan),
  };
  const created = await Model.create(doc);
  return created.toObject({ versionKey: false });
}

export interface ListScanRunsOptions {
  userId?: string | null;
  rootPath?: string;
  limit?: number;
  skip?: number;
}

export async function listScanRuns(
  connection: Connection,
  options: ListScanRunsOptions = {},
): Promise<ScanRunDocument[]> {
  const Model = getScanRunModel(connection);
  const query: Record<string, unknown> = {};
  if (options.userId !== undefined) query.userId = options.userId;
  if (options.rootPath) query.rootPath = options.rootPath;
  return Model.find(query)
    .sort({ createdAt: -1 })
    .skip(options.skip ?? 0)
    .limit(options.limit ?? 50)
    .lean<ScanRunDocument[]>()
    .exec();
}

export async function getScanRunById(
  connection: Connection,
  id: string,
): Promise<ScanRunDocument | null> {
  const Model = getScanRunModel(connection);
  return Model.findById(id).lean<ScanRunDocument | null>().exec();
}

export async function countScanRuns(
  connection: Connection,
  userId?: string | null,
): Promise<number> {
  const Model = getScanRunModel(connection);
  const query = userId !== undefined ? { userId } : {};
  return Model.countDocuments(query).exec();
}

/* --- Users ---------------------------------------------------------- */

export interface CreateUserInput {
  email: string;
  passwordHash: string;
}

export async function createUser(
  connection: Connection,
  input: CreateUserInput,
): Promise<UserDocument> {
  const Model = getUserModel(connection);
  const created = await Model.create(input);
  return created.toObject({ versionKey: false });
}

export async function findUserByEmail(
  connection: Connection,
  email: string,
): Promise<UserDocument | null> {
  const Model = getUserModel(connection);
  return Model.findOne({ email: email.toLowerCase() }).lean<UserDocument | null>().exec();
}

/* --- Rules-pack updates -------------------------------------------- */

export interface LogRulesPackUpdateInput {
  outcome: UpdateOutcomeKind;
  fromCommit: string | null;
  toCommit: string | null;
  fromVersion: string | null;
  toVersion: string | null;
  reason?: string | null;
}

export async function logRulesPackUpdate(
  connection: Connection,
  input: LogRulesPackUpdateInput,
): Promise<RulesPackUpdateDocument> {
  const Model = getRulesPackUpdateModel(connection);
  const created = await Model.create({
    outcome: input.outcome,
    fromCommit: input.fromCommit,
    toCommit: input.toCommit,
    fromVersion: input.fromVersion,
    toVersion: input.toVersion,
    reason: input.reason ?? null,
    occurredAt: new Date(),
  });
  return created.toObject({ versionKey: false });
}

export async function listRulesPackUpdates(
  connection: Connection,
  limit = 50,
): Promise<RulesPackUpdateDocument[]> {
  const Model = getRulesPackUpdateModel(connection);
  return Model.find()
    .sort({ occurredAt: -1 })
    .limit(limit)
    .lean<RulesPackUpdateDocument[]>()
    .exec();
}

/* --- AI fixes ------------------------------------------------------- */

export interface SaveAiFixInput {
  scanId: string;
  findingKey: string;
  ruleId: string;
  provider: AiFixDocument['provider'];
  model: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  prompt: string;
  response: string;
}

export async function saveAiFix(
  connection: Connection,
  input: SaveAiFixInput,
): Promise<AiFixDocument> {
  const Model = getAiFixModel(connection);
  // Upsert so a re-run for the same (scanId, findingKey) overwrites
  // the previous cached output — useful when the LLM model is bumped.
  const result = await Model.findOneAndUpdate(
    { scanId: input.scanId, findingKey: input.findingKey },
    { $set: input },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  )
    .lean<AiFixDocument>()
    .exec();
  return result;
}

export async function findAiFix(
  connection: Connection,
  scanId: string,
  findingKey: string,
): Promise<AiFixDocument | null> {
  const Model = getAiFixModel(connection);
  return Model.findOne({ scanId, findingKey }).lean<AiFixDocument | null>().exec();
}

export async function listAiFixesForScan(
  connection: Connection,
  scanId: string,
): Promise<AiFixDocument[]> {
  const Model = getAiFixModel(connection);
  return Model.find({ scanId }).sort({ createdAt: 1 }).lean<AiFixDocument[]>().exec();
}
