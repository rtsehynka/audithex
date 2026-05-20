import type { Connection, Model } from 'mongoose';
import { Schema } from 'mongoose';

/**
 * Log entry for every `audithex update` invocation. Surfaces in the UI
 * so the user can see when a rules-pack change altered findings.
 */
export type UpdateOutcomeKind = 'up-to-date' | 'installed' | 'fetch-failed' | 'rolled-back';

export interface RulesPackUpdateDocument {
  _id?: string;
  outcome: UpdateOutcomeKind;
  fromCommit: string | null;
  toCommit: string | null;
  fromVersion: string | null;
  toVersion: string | null;
  reason?: string | null;
  occurredAt: Date;
}

const RulesPackUpdateSchema = new Schema<RulesPackUpdateDocument>(
  {
    outcome: { type: String, required: true, index: true },
    fromCommit: { type: String, default: null },
    toCommit: { type: String, default: null },
    fromVersion: { type: String, default: null },
    toVersion: { type: String, default: null },
    reason: { type: String, default: null },
    occurredAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: false, collection: 'rules_pack_updates' },
);

export function getRulesPackUpdateModel(connection: Connection): Model<RulesPackUpdateDocument> {
  const existing = connection.models.RulesPackUpdate as Model<RulesPackUpdateDocument> | undefined;
  if (existing) return existing;
  return connection.model<RulesPackUpdateDocument>('RulesPackUpdate', RulesPackUpdateSchema);
}
