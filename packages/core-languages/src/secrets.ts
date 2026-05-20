import type { Provider } from './provider.js';

/**
 * Language-agnostic patterns matching published API key shapes.
 * Patterns are intentionally narrow to keep false positives near zero.
 * Each prefix encodes a known provider, so a hit doubles as a Provider tag.
 */
export interface SecretPattern {
  provider: Provider;
  regex: RegExp;
  description: string;
}

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    provider: 'openai',
    regex: /\bsk-(?!ant-)[A-Za-z0-9]{20,}\b/g,
    description: 'OpenAI API key prefix',
  },
  {
    provider: 'anthropic',
    regex: /\bsk-ant-[A-Za-z0-9_-]{30,}\b/g,
    description: 'Anthropic API key prefix',
  },
  {
    provider: 'google',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    description: 'Google Cloud API key prefix',
  },
];
