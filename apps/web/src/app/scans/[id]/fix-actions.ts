'use server';

import { findAiFix, saveAiFix } from '@audithex/core-persistence';
import { z } from 'zod';
import { requireSession } from '../../../lib/auth';
import { getConnection } from '../../../lib/db';
import { loadWebEnv } from '../../../lib/env';
import {
  estimateCostUsd,
  isLlmAvailable,
  llmProviderName,
  requestFixFromLlm,
} from '../../../lib/llm';
import { getScan } from '../../../lib/queries';

const InputSchema = z.object({
  scanId: z.string().min(1),
  findingKey: z.string().min(1),
});

export interface FixActionResult {
  ok: boolean;
  cached: boolean;
  provider: 'anthropic' | 'openai' | 'gemini' | 'dry-run' | 'unconfigured';
  model: string;
  costUsd: number;
  response: string;
  error?: string;
}

export async function requestAiFix(raw: unknown): Promise<FixActionResult> {
  await requireSession();
  const parsed = InputSchema.safeParse(raw);
  const env = loadWebEnv();
  const provider = await llmProviderName();
  if (!parsed.success) {
    return {
      ok: false,
      cached: false,
      provider,
      model: '',
      costUsd: 0,
      response: '',
      error: 'Invalid request.',
    };
  }
  const { scanId, findingKey } = parsed.data;

  if (!(await isLlmAvailable())) {
    return {
      ok: false,
      cached: false,
      provider,
      model: env.AUDITHEX_LLM_MODEL,
      costUsd: 0,
      response: '',
      error:
        'No AI provider configured. Set it on /settings/ai or export ANTHROPIC_API_KEY (or AUDITHEX_LLM_DRY_RUN=true for testing).',
    };
  }

  const conn = await getConnection();
  const cached = await findAiFix(conn, scanId, findingKey);
  if (cached) {
    return {
      ok: true,
      cached: true,
      provider: cached.provider as FixActionResult['provider'],
      model: cached.model,
      costUsd: cached.costUsd,
      response: cached.response,
    };
  }

  const scan = await getScan(scanId);
  if (!scan) {
    return {
      ok: false,
      cached: false,
      provider,
      model: env.AUDITHEX_LLM_MODEL,
      costUsd: 0,
      response: '',
      error: 'Scan not found.',
    };
  }
  const finding = scan.findings.find((f) => `${f.ruleId}|${f.file}|${f.line}` === findingKey);
  if (!finding) {
    return {
      ok: false,
      cached: false,
      provider,
      model: env.AUDITHEX_LLM_MODEL,
      costUsd: 0,
      response: '',
      error: 'Finding not found in this scan.',
    };
  }

  const projected = await estimateCostUsd({
    ruleId: finding.ruleId,
    severity: finding.severity,
    file: finding.file,
    line: finding.line,
    messageKey: finding.messageKey,
  });
  if (projected > env.AUDITHEX_LLM_COST_CAP_USD) {
    return {
      ok: false,
      cached: false,
      provider,
      model: env.AUDITHEX_LLM_MODEL,
      costUsd: projected,
      response: '',
      error: `Estimated cost $${projected.toFixed(4)} exceeds AUDITHEX_LLM_COST_CAP_USD ($${env.AUDITHEX_LLM_COST_CAP_USD.toFixed(2)}).`,
    };
  }

  let result: Awaited<ReturnType<typeof requestFixFromLlm>>;
  try {
    result = await requestFixFromLlm({
      ruleId: finding.ruleId,
      severity: finding.severity,
      file: finding.file,
      line: finding.line,
      messageKey: finding.messageKey,
    });
  } catch (err) {
    return {
      ok: false,
      cached: false,
      provider,
      model: env.AUDITHEX_LLM_MODEL,
      costUsd: 0,
      response: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (result.provider === 'unconfigured') {
    return {
      ok: true,
      cached: false,
      provider: 'unconfigured',
      model: result.model,
      costUsd: result.costUsd,
      response: result.response,
    };
  }
  await saveAiFix(conn, {
    scanId,
    findingKey,
    ruleId: finding.ruleId,
    provider: result.provider,
    model: result.model,
    costUsd: result.costUsd,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    prompt: result.prompt,
    response: result.response,
  });

  return {
    ok: true,
    cached: false,
    provider: result.provider,
    model: result.model,
    costUsd: result.costUsd,
    response: result.response,
  };
}
