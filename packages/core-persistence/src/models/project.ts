import type { Severity } from '@audithex/core-types';
import type { Connection, Model } from 'mongoose';
import { Schema } from 'mongoose';

/**
 * Project = a named target the user scans repeatedly. The CLI's
 * `audithex scan --project <name>` (or the AUDITHEX_PROJECT env var)
 * looks up a project by `name`, scans `rootPath`, applies the
 * configured `severityOverrides` and `disabledRuleIds` to the rules
 * engine, and persists the resulting ScanRun with `projectId` set.
 *
 * The web UI surfaces a CRUD form over the same document so a single
 * source of truth lives in MongoDB.
 */
/**
 * RAG / operational database the project's LLM reads from. When set,
 * the scanner connects to this database after the filesystem scan and
 * walks the configured tables — looking for the same rule classes
 * (secrets, prompt-injection payloads, PII) the file scan covers, but
 * inside row content. The driver list grows as we add dialects;
 * `postgres` is the first-supported one.
 *
 * The "scan all tables" toggle is deliberately opt-in: walking every
 * table by default is too much overhead for big production schemas.
 */
export type DbDriver = 'postgres' | 'mongodb';

export interface ProjectDbConnection {
  driver: DbDriver;
  uri: string;
  database?: string | null;
}

export interface ProjectDocument {
  _id?: string;
  name: string;
  rootPath: string;
  description?: string | null;
  severityOverrides: Record<string, Severity>;
  disabledRuleIds: string[];
  /**
   * Language IDs (typescript, python, php, …) the scanner should
   * include. Empty = include every language the rules pack supports.
   * Useful for narrowing a polyglot monorepo down to the stack the
   * project actually uses.
   */
  languages: string[];
  /**
   * OWASP LLM Top 10 category IDs (LLM01..LLM10) the user has turned
   * OFF for this project. A rule is skipped iff EVERY entry in its
   * `owasp[]` is in this list. By default the array is empty, which
   * means every category is enabled — the user opts out per group.
   */
  disabledOwaspGroups: string[];
  /**
   * Free-form extra extensions to include beyond what the language
   * registry knows about (e.g. `.tf`, `.yml`). Includes the leading
   * dot; lower-cased on persist.
   */
  extraExtensions: string[];
  dbConnection?: ProjectDbConnection | null;
  dbTables: string[];
  dbScanAllTables: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const DbConnectionSchema = new Schema<ProjectDbConnection>(
  {
    driver: { type: String, required: true, enum: ['postgres', 'mongodb'] satisfies DbDriver[] },
    uri: { type: String, required: true },
    database: { type: String, default: null },
  },
  { _id: false },
);

const ProjectSchema = new Schema<ProjectDocument>(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    rootPath: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    severityOverrides: { type: Schema.Types.Mixed, default: {} },
    disabledRuleIds: { type: [String], default: [] },
    languages: { type: [String], default: [] },
    extraExtensions: { type: [String], default: [] },
    disabledOwaspGroups: { type: [String], default: [] },
    dbConnection: { type: DbConnectionSchema, default: null },
    dbTables: { type: [String], default: [] },
    dbScanAllTables: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'projects' },
);

export function getProjectModel(connection: Connection): Model<ProjectDocument> {
  const existing = connection.models.Project as Model<ProjectDocument> | undefined;
  if (existing) return existing;
  return connection.model<ProjectDocument>('Project', ProjectSchema);
}
