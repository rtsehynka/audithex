import { type LlmProviderKind, getAiSettings } from '@audithex/core-persistence';
import { getConnection } from './db';
import { loadWebEnv } from './env';

/**
 * Multi-provider LLM client for the "Explain how to fix" button.
 * Reads provider + key + model from Mongo's AiSettings singleton first
 * (set on /settings/ai); falls back to env-based Anthropic config so
 * the existing dry-run + ANTHROPIC_API_KEY flows keep working.
 *
 * No SDK deps — each provider is a single POST with a stable JSON shape.
 *
 * Supported providers:
 *   - anthropic — Claude Messages API
 *   - openai   — OpenAI Chat Completions
 *   - gemini   — Google GenerativeLanguage v1beta
 */

export interface RequestFixInput {
  ruleId: string;
  severity: string;
  file: string;
  line: number;
  messageKey: string;
}

export type FixProvider = LlmProviderKind | 'dry-run' | 'unconfigured';

export interface FixLlmResult {
  provider: FixProvider;
  model: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  prompt: string;
  response: string;
}

interface ResolvedSettings {
  provider: LlmProviderKind;
  apiKey: string;
  model: string;
  costCapUsd: number;
  source: 'mongo' | 'env';
}

// USD per million tokens (input / output). Approximate published rates
// — actual price drift is usually a few percent. Override per-rule via
// PRICING below when a provider's tiering becomes worth modelling.
const PRICING: Record<LlmProviderKind, { input: number; output: number }> = {
  anthropic: { input: 3, output: 15 },
  openai: { input: 0.15, output: 0.6 },
  gemini: { input: 0.075, output: 0.3 },
};

const FALLBACK_MODEL: Record<LlmProviderKind, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
};

const SYSTEM_PROMPT =
  'You are Audithex, a local-first security review assistant. Reply with a concise, actionable explanation (5–8 sentences max) of how to fix the supplied finding. Always include a one-line code-style suggestion when applicable. Never fabricate file contents.';

export async function requestFixFromLlm(input: RequestFixInput): Promise<FixLlmResult> {
  const prompt = buildPrompt(input);
  const env = loadWebEnv();

  // A real provider configured on /settings/ai (saved in Mongo) wins
  // over AUDITHEX_LLM_DRY_RUN. The dry-run env knob is meant for CI /
  // screenshot pipelines that have no key — once the user wires up a
  // key via the UI we honour it instead of returning canned text.
  const settings = await resolveSettings();
  if (settings) {
    switch (settings.provider) {
      case 'anthropic':
        return callAnthropic(settings, prompt);
      case 'openai':
        return callOpenAi(settings, prompt);
      case 'gemini':
        return callGemini(settings, prompt);
      default: {
        const _exhaustive: never = settings.provider;
        throw new Error(`Unsupported provider: ${String(_exhaustive)}`);
      }
    }
  }

  if (env.AUDITHEX_LLM_DRY_RUN) {
    return {
      provider: 'dry-run',
      model: env.AUDITHEX_LLM_MODEL,
      costUsd: 0,
      inputTokens: estimateTokens(prompt),
      outputTokens: 120,
      prompt,
      response: cannedResponseFor(input),
    };
  }

  // No Mongo settings, no env key, no dry-run — return the canned
  // answer so the UI doesn't break, but tag it as `unconfigured` so
  // the cache layer knows not to store it and the user sees the
  // pointer to /settings/ai.
  return {
    provider: 'unconfigured',
    model: env.AUDITHEX_LLM_MODEL,
    costUsd: 0,
    inputTokens: estimateTokens(prompt),
    outputTokens: 120,
    prompt,
    response: cannedResponseFor(input),
  };
}

export async function estimateCostUsd(input: RequestFixInput): Promise<number> {
  const prompt = buildPrompt(input);
  const settings = await resolveSettings();
  if (!settings) return 0;
  const pricing = PRICING[settings.provider];
  return computeCostUsd(estimateTokens(prompt), 250, pricing);
}

export async function isLlmAvailable(): Promise<boolean> {
  const env = loadWebEnv();
  if (env.AUDITHEX_LLM_DRY_RUN) return true;
  const settings = await resolveSettings();
  return Boolean(settings);
}

export async function llmProviderName(): Promise<FixProvider> {
  const env = loadWebEnv();
  if (env.AUDITHEX_LLM_DRY_RUN) return 'dry-run';
  const settings = await resolveSettings();
  if (!settings) return 'unconfigured';
  return settings.provider;
}

/**
 * Reads the AiSettings singleton from Mongo; falls back to legacy env
 * vars (ANTHROPIC_API_KEY + AUDITHEX_LLM_MODEL) so existing
 * .env-driven deployments keep working without a database write.
 * Returns null when no key is available anywhere.
 */
async function resolveSettings(): Promise<ResolvedSettings | null> {
  try {
    const conn = await getConnection();
    const saved = await getAiSettings(conn);
    if (saved?.apiKey && saved.apiKey.length > 0) {
      return {
        provider: saved.provider,
        apiKey: saved.apiKey,
        model: saved.model || FALLBACK_MODEL[saved.provider],
        costCapUsd: saved.costCapUsd,
        source: 'mongo',
      };
    }
  } catch {
    // Mongo unreachable — fall through to env.
  }
  const env = loadWebEnv();
  if (env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.AUDITHEX_LLM_MODEL || FALLBACK_MODEL.anthropic,
      costCapUsd: env.AUDITHEX_LLM_COST_CAP_USD,
      source: 'env',
    };
  }
  return null;
}

async function callAnthropic(settings: ResolvedSettings, prompt: string): Promise<FixLlmResult> {
  const body = {
    model: settings.model,
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  };
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Anthropic API ${response.status}: ${await safeText(response)}`);
  }
  const payload = (await response.json()) as AnthropicResponse;
  const text = payload.content?.find((c) => c.type === 'text')?.text ?? '(empty response)';
  const inputTokens = payload.usage?.input_tokens ?? estimateTokens(prompt);
  const outputTokens = payload.usage?.output_tokens ?? estimateTokens(text);
  return {
    provider: 'anthropic',
    model: settings.model,
    costUsd: computeCostUsd(inputTokens, outputTokens, PRICING.anthropic),
    inputTokens,
    outputTokens,
    prompt,
    response: text,
  };
}

async function callOpenAi(settings: ResolvedSettings, prompt: string): Promise<FixLlmResult> {
  const body = {
    model: settings.model,
    max_tokens: 600,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
  };
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`OpenAI API ${response.status}: ${await safeText(response)}`);
  }
  const payload = (await response.json()) as OpenAiResponse;
  const text = payload.choices?.[0]?.message?.content ?? '(empty response)';
  const inputTokens = payload.usage?.prompt_tokens ?? estimateTokens(prompt);
  const outputTokens = payload.usage?.completion_tokens ?? estimateTokens(text);
  return {
    provider: 'openai',
    model: settings.model,
    costUsd: computeCostUsd(inputTokens, outputTokens, PRICING.openai),
    inputTokens,
    outputTokens,
    prompt,
    response: text,
  };
}

async function callGemini(settings: ResolvedSettings, prompt: string): Promise<FixLlmResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    settings.model,
  )}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 600 },
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Gemini API ${response.status}: ${await safeText(response)}`);
  }
  const payload = (await response.json()) as GeminiResponse;
  const text =
    payload.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text ?? '(empty response)';
  const inputTokens = payload.usageMetadata?.promptTokenCount ?? estimateTokens(prompt);
  const outputTokens = payload.usageMetadata?.candidatesTokenCount ?? estimateTokens(text);
  return {
    provider: 'gemini',
    model: settings.model,
    costUsd: computeCostUsd(inputTokens, outputTokens, PRICING.gemini),
    inputTokens,
    outputTokens,
    prompt,
    response: text,
  };
}

function buildPrompt(input: RequestFixInput): string {
  return [
    'A static security scanner flagged the following finding. Explain how to fix it in plain English.',
    '',
    `rule:     ${input.ruleId}`,
    `severity: ${input.severity}`,
    `location: ${input.file}:${input.line}`,
    `message:  ${input.messageKey}`,
    '',
    'Return:',
    '  - one paragraph (3–5 sentences) explaining the underlying vulnerability and what to do about it.',
    '  - one fenced code snippet showing the corrected pattern (use TypeScript syntax unless the rule is clearly for another language).',
  ].join('\n');
}

function computeCostUsd(
  inputTokens: number,
  outputTokens: number,
  pricing: { input: number; output: number },
): number {
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * 10_000) / 10_000;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

async function safeText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 200);
  } catch {
    return String(response.status);
  }
}

function cannedResponseFor(input: RequestFixInput): string {
  return [
    `[dry-run] **${input.ruleId}** flagged at \`${input.file}:${input.line}\`.`,
    '',
    'This is a deterministic, canned response — configure a provider on `/settings/ai` (Anthropic / OpenAI / Gemini) or set `ANTHROPIC_API_KEY` to get a real LLM-generated fix and clear `AUDITHEX_LLM_DRY_RUN`.',
    '',
    'Typical remediation: validate every external input at the trust boundary, prefer parameterised APIs over string concatenation, and never feed untrusted strings to `eval` / `exec` / shell.',
    '',
    '```ts',
    '// Example: parameterised query instead of concatenation',
    'const account = await db.query(',
    "  'SELECT * FROM accounts WHERE id = $1',",
    '  [validatedId],',
    ');',
    '```',
  ].join('\n');
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface OpenAiResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}
