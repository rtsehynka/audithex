import type { Provider } from './provider.js';

/**
 * Language-agnostic patterns for recognising LLM model identifiers in
 * string literals. Model strings look the same in any host language
 * (`"claude-opus-4-7"` in TS is identical to the same token in Python),
 * so they live in the central registry instead of being duplicated per
 * language file.
 */
export interface ModelPattern {
  provider: Provider;
  regex: RegExp;
}

export const MODEL_PATTERNS: readonly ModelPattern[] = [
  { provider: 'anthropic', regex: /\bclaude-[a-z0-9]+(?:-[a-z0-9]+){1,4}\b/g },
  { provider: 'openai', regex: /\bgpt-[a-z0-9]+(?:-[a-z0-9]+){0,4}\b/g },
  { provider: 'openai', regex: /\bo[134](?:-[a-z]+)?\b/g },
  { provider: 'google', regex: /\bgemini-[a-z0-9]+(?:-[a-z0-9.]+){0,4}\b/g },
  { provider: 'mistral', regex: /\bmistral-[a-z]+(?:-[a-z0-9]+){0,4}\b/g },
  { provider: 'cohere', regex: /\bcommand-[a-z]+(?:-[a-z0-9]+){0,4}\b/g },
  { provider: 'unknown', regex: /\bllama-?\d+(?:[.-][a-z0-9]+){0,4}\b/g },
];
