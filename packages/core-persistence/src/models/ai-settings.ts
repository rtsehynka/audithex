import type { Connection, Model } from 'mongoose';
import { Schema } from 'mongoose';

/**
 * Singleton document holding the local user's AI provider preference,
 * API key, model id, and per-fix cost cap. The web UI ships ONE
 * AiSettings row (id: 'default'); upserts overwrite it in place.
 *
 * The key is stored in plaintext because Audithex is single-user and
 * local-only — the Mongo it talks to lives on the same machine. If
 * we ever ship a hosted multi-user version this becomes a per-user
 * record and the key gets encrypted with a server-side master key.
 */
export type LlmProviderKind = 'anthropic' | 'openai' | 'gemini';

export interface AiSettingsDocument {
  _id?: string;
  provider: LlmProviderKind;
  apiKey: string;
  model: string;
  costCapUsd: number;
  updatedAt?: Date;
  createdAt?: Date;
}

const AiSettingsSchema = new Schema<AiSettingsDocument>(
  {
    _id: { type: String, default: 'default' },
    provider: {
      type: String,
      required: true,
      enum: ['anthropic', 'openai', 'gemini'] satisfies LlmProviderKind[],
    },
    apiKey: { type: String, default: '' },
    model: { type: String, required: true, trim: true },
    costCapUsd: { type: Number, default: 1.0, min: 0 },
  },
  { timestamps: true, collection: 'ai_settings', _id: false },
);

export function getAiSettingsModel(connection: Connection): Model<AiSettingsDocument> {
  const existing = connection.models.AiSettings as Model<AiSettingsDocument> | undefined;
  if (existing) return existing;
  return connection.model<AiSettingsDocument>('AiSettings', AiSettingsSchema);
}
