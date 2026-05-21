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
export interface ProjectDocument {
  _id?: string;
  name: string;
  rootPath: string;
  description?: string | null;
  severityOverrides: Record<string, Severity>;
  disabledRuleIds: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

const ProjectSchema = new Schema<ProjectDocument>(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    rootPath: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    severityOverrides: { type: Schema.Types.Mixed, default: {} },
    disabledRuleIds: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'projects' },
);

export function getProjectModel(connection: Connection): Model<ProjectDocument> {
  const existing = connection.models.Project as Model<ProjectDocument> | undefined;
  if (existing) return existing;
  return connection.model<ProjectDocument>('Project', ProjectSchema);
}
