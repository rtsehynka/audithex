import { loadWebEnv } from './env';

/**
 * Direct HTTP client for the Anthropic Messages API. No SDK dependency —
 * the surface we need is one POST and a fixed JSON shape, so an inline
 * fetch keeps the bundle lean and the deps audit-friendly.
 *
 * The dry-run path returns a deterministic canned answer with zero cost
 * so Cypress + Puppeteer can exercise the explain-fix UI without an
 * API key.
 */

export interface RequestFixInput {
  ruleId: string;
  severity: string;
  file: string;
  line: number;
  messageKey: string;
}

export interface FixLlmResult {
  provider: 'anthropic' | 'dry-run';
  model: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  prompt: string;
  response: string;
}

// Claude Sonnet pricing snapshot, in USD per million tokens. Override
// per-deployment via AUDITHEX_LLM_INPUT_USD_PER_MTOK / output if it
// drifts; the env schema does not enforce them yet because they
// rarely move.
const INPUT_USD_PER_MTOK = 3;
const OUTPUT_USD_PER_MTOK = 15;

export async function requestFixFromLlm(input: RequestFixInput): Promise<FixLlmResult> {
  const env = loadWebEnv();
  const prompt = buildPrompt(input);

  if (env.AUDITHEX_LLM_DRY_RUN || !env.ANTHROPIC_API_KEY) {
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

  const body = {
    model: env.AUDITHEX_LLM_MODEL,
    max_tokens: 600,
    system:
      'You are Audithex, a local-first security review assistant. Reply with a concise, actionable explanation (5–8 sentences max) of how to fix the supplied finding. Always include a one-line code-style suggestion when applicable. Never fabricate file contents.',
    messages: [{ role: 'user', content: prompt }],
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => String(response.status));
    throw new Error(`Anthropic API ${response.status}: ${message.slice(0, 200)}`);
  }
  const payload = (await response.json()) as AnthropicResponse;
  const text = payload.content?.find((c) => c.type === 'text')?.text ?? '(empty response)';
  const inputTokens = payload.usage?.input_tokens ?? estimateTokens(prompt);
  const outputTokens = payload.usage?.output_tokens ?? estimateTokens(text);
  const costUsd = computeCostUsd(inputTokens, outputTokens);

  return {
    provider: 'anthropic',
    model: env.AUDITHEX_LLM_MODEL,
    costUsd,
    inputTokens,
    outputTokens,
    prompt,
    response: text,
  };
}

export function estimateCostUsd(input: RequestFixInput): number {
  const prompt = buildPrompt(input);
  // Assume ~250 tokens of LLM output as a reasonable median.
  return computeCostUsd(estimateTokens(prompt), 250);
}

export function isLlmAvailable(): boolean {
  const env = loadWebEnv();
  return Boolean(env.AUDITHEX_LLM_DRY_RUN || env.ANTHROPIC_API_KEY);
}

export function llmProviderName(): 'anthropic' | 'dry-run' | 'unconfigured' {
  const env = loadWebEnv();
  if (env.AUDITHEX_LLM_DRY_RUN) return 'dry-run';
  return env.ANTHROPIC_API_KEY ? 'anthropic' : 'unconfigured';
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

function computeCostUsd(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * INPUT_USD_PER_MTOK;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_USD_PER_MTOK;
  return Math.round((inputCost + outputCost) * 10_000) / 10_000;
}

function estimateTokens(text: string): number {
  // Rough 4-chars-per-token heuristic; close enough for cost preview.
  return Math.max(1, Math.ceil(text.length / 4));
}

function cannedResponseFor(input: RequestFixInput): string {
  return [
    `[dry-run] **${input.ruleId}** flagged at \`${input.file}:${input.line}\`.`,
    '',
    'This is a deterministic, canned response — set `ANTHROPIC_API_KEY` to get a real LLM-generated fix and clear `AUDITHEX_LLM_DRY_RUN`.',
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
