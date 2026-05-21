import { createHash } from 'node:crypto';
import type { Finding, ScanKind, ScanResult, Severity } from '@audithex/core-types';
import type { Connection } from 'mongoose';
import { type AiFixDocument, getAiFixModel } from './models/ai-fix.js';
import {
  type AiSettingsDocument,
  type LlmProviderKind,
  getAiSettingsModel,
} from './models/ai-settings.js';
import {
  type ProjectDbConnection,
  type ProjectDocument,
  getProjectModel,
} from './models/project.js';
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
    findings: result.findings.map((f) =>
      f.kind === 'static'
        ? {
            ruleId: f.ruleId,
            severity: f.severity,
            file: f.location.file,
            line: f.location.line,
            messageKey: f.messageKey,
          }
        : {
            ruleId: f.ruleId,
            severity: f.severity,
            payloadId: f.payloadId,
            messageKey: f.messageKey,
          },
    ),
  });
  return createHash('sha256').update(payload).digest('hex');
}

export interface SaveScanRunInput {
  scan: ScanResult;
  userId?: string | null;
  projectId?: string | null;
  scanType?: ScanKind;
  dynamicScanBudget?: { maxUsd: number; spentUsd: number; exhausted: boolean } | null;
}

export async function saveScanRun(
  connection: Connection,
  input: SaveScanRunInput,
): Promise<ScanRunDocument> {
  const Model = getScanRunModel(connection);
  const doc: Partial<ScanRunDocument> = {
    userId: input.userId ?? null,
    projectId: input.projectId ?? null,
    rootPath: input.scan.rootPath,
    scannedAt: input.scan.scannedAt,
    discovery: input.scan.discovery,
    findings: input.scan.findings as Finding[],
    rulesVersion: input.scan.rulesVersion,
    audithexVersion: input.scan.audithexVersion,
    elapsedMs: input.scan.elapsedMs,
    topSeverity: computeTopSeverity(input.scan.findings),
    fingerprint: fingerprintScanResult(input.scan),
    scanType: input.scanType ?? 'static',
    dynamicScanBudget: input.dynamicScanBudget ?? null,
  };
  const created = await Model.create(doc);
  return created.toObject({ versionKey: false });
}

export interface ListScanRunsOptions {
  userId?: string | null;
  projectId?: string | null;
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
  if (options.projectId !== undefined) query.projectId = options.projectId;
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

export async function findUserById(
  connection: Connection,
  id: string,
): Promise<UserDocument | null> {
  const Model = getUserModel(connection);
  return Model.findById(id).lean<UserDocument | null>().exec();
}

export type UpdateUserResult =
  | { ok: true; user: UserDocument }
  | { ok: false; reason: 'duplicate' | 'not-found' | 'error'; message?: string };

export async function updateUserEmail(
  connection: Connection,
  id: string,
  newEmail: string,
): Promise<UpdateUserResult> {
  const Model = getUserModel(connection);
  const email = newEmail.toLowerCase();
  const clash = await Model.findOne({ email, _id: { $ne: id } })
    .lean()
    .exec();
  if (clash) return { ok: false, reason: 'duplicate' };
  try {
    const updated = await Model.findByIdAndUpdate(
      id,
      { $set: { email } },
      { new: true, runValidators: true },
    )
      .lean<UserDocument | null>()
      .exec();
    if (!updated) return { ok: false, reason: 'not-found' };
    return { ok: true, user: updated };
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function updateUserPassword(
  connection: Connection,
  id: string,
  newPasswordHash: string,
): Promise<UpdateUserResult> {
  const Model = getUserModel(connection);
  const updated = await Model.findByIdAndUpdate(
    id,
    { $set: { passwordHash: newPasswordHash } },
    { new: true },
  )
    .lean<UserDocument | null>()
    .exec();
  if (!updated) return { ok: false, reason: 'not-found' };
  return { ok: true, user: updated };
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

/* --- Projects ------------------------------------------------------- */

export interface CreateProjectInput {
  name: string;
  rootPath: string;
  description?: string | null;
  severityOverrides?: ProjectDocument['severityOverrides'];
  disabledRuleIds?: string[];
  languages?: string[];
  extraExtensions?: string[];
  disabledOwaspGroups?: string[];
  disabledBlockIds?: string[];
  dbConnection?: ProjectDbConnection | null;
  dbTables?: string[];
  dbScanAllTables?: boolean;
}

export type UpdateProjectInput = Partial<Omit<CreateProjectInput, 'name'>> & {
  name?: string;
};

export async function createProject(
  connection: Connection,
  input: CreateProjectInput,
): Promise<ProjectDocument> {
  const Model = getProjectModel(connection);
  const created = await Model.create({
    name: input.name,
    rootPath: input.rootPath,
    description: input.description ?? null,
    severityOverrides: input.severityOverrides ?? {},
    disabledRuleIds: input.disabledRuleIds ?? [],
    languages: input.languages ?? [],
    extraExtensions: (input.extraExtensions ?? []).map((e) => e.toLowerCase()),
    disabledOwaspGroups: input.disabledOwaspGroups ?? [],
    disabledBlockIds: input.disabledBlockIds ?? [],
    dbConnection: input.dbConnection ?? null,
    dbTables: input.dbTables ?? [],
    dbScanAllTables: input.dbScanAllTables ?? false,
  });
  const doc = created.toObject({ versionKey: false });
  return {
    ...doc,
    severityOverrides: doc.severityOverrides ?? {},
    disabledRuleIds: doc.disabledRuleIds ?? [],
    languages: doc.languages ?? [],
    extraExtensions: doc.extraExtensions ?? [],
    disabledOwaspGroups: doc.disabledOwaspGroups ?? [],
    disabledBlockIds: doc.disabledBlockIds ?? [],
    dbTables: doc.dbTables ?? [],
    dbScanAllTables: doc.dbScanAllTables ?? false,
  };
}

export async function listProjects(connection: Connection): Promise<ProjectDocument[]> {
  const Model = getProjectModel(connection);
  return Model.find().sort({ name: 1 }).lean<ProjectDocument[]>().exec();
}

export async function getProjectById(
  connection: Connection,
  id: string,
): Promise<ProjectDocument | null> {
  const Model = getProjectModel(connection);
  return Model.findById(id).lean<ProjectDocument | null>().exec();
}

export async function getProjectByName(
  connection: Connection,
  name: string,
): Promise<ProjectDocument | null> {
  const Model = getProjectModel(connection);
  return Model.findOne({ name }).lean<ProjectDocument | null>().exec();
}

export async function updateProject(
  connection: Connection,
  id: string,
  input: UpdateProjectInput,
): Promise<ProjectDocument | null> {
  const Model = getProjectModel(connection);
  return Model.findByIdAndUpdate(id, { $set: input }, { new: true })
    .lean<ProjectDocument | null>()
    .exec();
}

export async function deleteProject(connection: Connection, id: string): Promise<boolean> {
  const Model = getProjectModel(connection);
  const result = await Model.deleteOne({ _id: id }).exec();
  return result.deletedCount > 0;
}

/* --- AI settings ---------------------------------------------------- */

export interface SaveAiSettingsInput {
  provider: LlmProviderKind;
  apiKey: string;
  model: string;
  costCapUsd: number;
}

export async function getAiSettings(connection: Connection): Promise<AiSettingsDocument | null> {
  const Model = getAiSettingsModel(connection);
  return Model.findById('default').lean<AiSettingsDocument | null>().exec();
}

export async function saveAiSettings(
  connection: Connection,
  input: SaveAiSettingsInput,
): Promise<AiSettingsDocument> {
  const Model = getAiSettingsModel(connection);
  const updated = await Model.findByIdAndUpdate(
    'default',
    {
      $set: {
        provider: input.provider,
        apiKey: input.apiKey,
        model: input.model,
        costCapUsd: input.costCapUsd,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
    .lean<AiSettingsDocument | null>()
    .exec();
  if (!updated) throw new Error('saveAiSettings: upsert did not return a document');
  return updated;
}
