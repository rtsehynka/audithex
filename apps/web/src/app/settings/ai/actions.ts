'use server';

import { type LlmProviderKind, saveAiSettings } from '@audithex/core-persistence';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '../../../lib/auth';
import { getConnection } from '../../../lib/db';
import { collectFieldErrors } from '../../../lib/form-errors';

export interface AiSettingsActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const PROVIDERS: LlmProviderKind[] = ['anthropic', 'openai', 'gemini'];

const Schema = z.object({
  provider: z.enum(['anthropic', 'openai', 'gemini'] as [LlmProviderKind, ...LlmProviderKind[]]),
  apiKey: z.string().min(0).max(2048),
  model: z.string().min(1, 'Model id is required.').max(256),
  costCapUsd: z
    .string()
    .min(1, 'Cost cap is required.')
    .refine((v) => Number.isFinite(Number.parseFloat(v)) && Number.parseFloat(v) >= 0, {
      message: 'Cost cap must be a non-negative number.',
    }),
});

export async function saveAiSettingsAction(
  _prev: unknown,
  formData: FormData,
): Promise<AiSettingsActionResult> {
  await requireSession();
  const rawProvider = String(formData.get('provider') ?? '');
  if (!PROVIDERS.includes(rawProvider as LlmProviderKind)) {
    return {
      ok: false,
      fieldErrors: { provider: 'Pick anthropic, openai, or gemini.' },
    };
  }
  const parsed = Schema.safeParse({
    provider: rawProvider,
    apiKey: String(formData.get('apiKey') ?? ''),
    model: String(formData.get('model') ?? ''),
    costCapUsd: String(formData.get('costCapUsd') ?? ''),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectFieldErrors(parsed.error.issues) };
  }
  const conn = await getConnection();
  try {
    await saveAiSettings(conn, {
      provider: parsed.data.provider,
      apiKey: parsed.data.apiKey.trim(),
      model: parsed.data.model.trim(),
      costCapUsd: Number.parseFloat(parsed.data.costCapUsd),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath('/settings');
  revalidatePath('/settings/ai');
  return { ok: true };
}
