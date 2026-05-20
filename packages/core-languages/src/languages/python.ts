import type { LanguageDefinition } from '../types.js';

export const python: LanguageDefinition = {
  id: 'python',
  displayName: 'Python',
  extensions: ['.py', '.pyi'],
  capabilities: {
    preferredParser: 'regex',
    scansAsCode: true,
  },
  lineCommentPrefixes: ['#'],
  sdkImportPatterns: [
    { provider: 'anthropic', regex: /^\s*(?:from\s+anthropic\b|import\s+anthropic\b)/gm },
    { provider: 'openai', regex: /^\s*(?:from\s+openai\b|import\s+openai\b)/gm },
    {
      provider: 'google',
      regex:
        /^\s*(?:from\s+google\.(?:generativeai|cloud\.aiplatform)\b|import\s+google\.(?:generativeai|cloud\.aiplatform)\b)/gm,
    },
    {
      provider: 'mistral',
      regex: /^\s*(?:from\s+mistralai\b|import\s+mistralai\b)/gm,
    },
    { provider: 'cohere', regex: /^\s*(?:from\s+cohere\b|import\s+cohere\b)/gm },
    {
      provider: 'langchain',
      regex: /^\s*(?:from\s+langchain(?:_[a-z0-9_]+)?\b|import\s+langchain(?:_[a-z0-9_]+)?\b)/gm,
    },
    {
      provider: 'llamaindex',
      regex: /^\s*(?:from\s+llama_index\b|import\s+llama_index\b)/gm,
    },
    { provider: 'ollama', regex: /^\s*(?:from\s+ollama\b|import\s+ollama\b)/gm },
  ],
  // Anthropic kwarg shape and OpenAI message-dict shape. Group 1 = prompt body.
  systemPromptKwargPatterns: [
    /\bsystem\s*=\s*(?:r|u|f|rb|br|rf|fr|b)?["']([^"'\n]{40,})["']/g,
    /["']role["']\s*:\s*["']system["']\s*,\s*["']content["']\s*:\s*["']([^"'\n]{40,})["']/g,
  ],
};
