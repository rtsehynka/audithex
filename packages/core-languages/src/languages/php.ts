import type { LanguageDefinition } from '../types.js';

export const php: LanguageDefinition = {
  id: 'php',
  displayName: 'PHP',
  extensions: ['.php'],
  capabilities: {
    preferredParser: 'regex',
    scansAsCode: true,
  },
  lineCommentPrefixes: ['//', '#', '*', '/*'],
  sdkImportPatterns: [
    { provider: 'anthropic', regex: /\buse\s+Anthropic\\[A-Z][A-Za-z0-9_\\]+\s*;/g },
    { provider: 'openai', regex: /\buse\s+OpenAI\\[A-Z][A-Za-z0-9_\\]+\s*;/g },
    { provider: 'cohere', regex: /\buse\s+Cohere\\[A-Z][A-Za-z0-9_\\]+\s*;/g },
    { provider: 'mistral', regex: /\buse\s+Mistral\\[A-Z][A-Za-z0-9_\\]+\s*;/g },
    {
      provider: 'google',
      regex: /\buse\s+Google\\(?:Cloud\\AIPlatform|GenerativeAI)[A-Za-z0-9_\\]*\s*;/g,
    },
  ],
  // PHP-array shapes — both single-key 'system' and OpenAI message arrays.
  systemPromptKwargPatterns: [
    /["']system["']\s*=>\s*["']([^"'\n]{40,})["']/g,
    /["']role["']\s*=>\s*["']system["']\s*,\s*["']content["']\s*=>\s*["']([^"'\n]{40,})["']/g,
  ],
};
