/**
 * Canonical list of LLM providers Audithex recognises across all languages.
 * Adding a new provider = add an entry here + extend each LanguageDefinition
 * with the matching import regex. Nothing else has to change.
 */
export const PROVIDERS = [
  'anthropic',
  'openai',
  'google',
  'mistral',
  'cohere',
  'langchain',
  'llamaindex',
  'vercel-ai',
  'mastra',
  'ollama',
  'unknown',
] as const;

export type Provider = (typeof PROVIDERS)[number];

export function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}
