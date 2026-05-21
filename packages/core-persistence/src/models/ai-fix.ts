import type { Connection, Model } from 'mongoose';
import { Schema } from 'mongoose';

/**
 * Cached output of an "Explain how to fix" LLM call. Lookups are keyed
 * by `(scanId, findingKey)` so repeated views of the same finding never
 * re-pay for the LLM call. The cost is recorded in dollars so the UI
 * can show the user where their per-scan cost cap stands.
 *
 * `findingKey` matches the identity the diff helper and eval-runner
 * use: `${ruleId}|${file}|${line}`.
 */
export type LlmProvider = 'anthropic' | 'openai' | 'gemini' | 'dry-run';

export interface AiFixDocument {
  _id?: string;
  scanId: string;
  findingKey: string;
  ruleId: string;
  provider: LlmProvider;
  model: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  prompt: string;
  response: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const AiFixSchema = new Schema<AiFixDocument>(
  {
    scanId: { type: String, required: true, index: true },
    findingKey: { type: String, required: true, index: true },
    ruleId: { type: String, required: true, index: true },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    costUsd: { type: Number, required: true },
    inputTokens: { type: Number, required: true },
    outputTokens: { type: Number, required: true },
    prompt: { type: String, required: true },
    response: { type: String, required: true },
  },
  { timestamps: true, collection: 'ai_fixes' },
);

// Single fix per (scan, finding) — cache lookup uses this index.
AiFixSchema.index({ scanId: 1, findingKey: 1 }, { unique: true });

export function getAiFixModel(connection: Connection): Model<AiFixDocument> {
  const existing = connection.models.AiFix as Model<AiFixDocument> | undefined;
  if (existing) return existing;
  return connection.model<AiFixDocument>('AiFix', AiFixSchema);
}
