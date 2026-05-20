import type { LanguageDefinition } from '../types.js';

export const go: LanguageDefinition = {
  id: 'go',
  displayName: 'Go',
  extensions: ['.go'],
  capabilities: {
    preferredParser: 'regex',
    scansAsCode: true,
  },
  lineCommentPrefixes: ['//', '*', '/*'],
  sdkImportPatterns: [
    {
      provider: 'anthropic',
      regex: /"github\.com\/anthropics\/anthropic-sdk-go(?:\/[a-z0-9-]+)*"/g,
    },
    { provider: 'openai', regex: /"github\.com\/sashabaranov\/go-openai"/g },
    {
      provider: 'google',
      regex: /"(?:cloud\.google\.com\/go\/vertexai|github\.com\/google\/generative-ai-go)[^"]*"/g,
    },
    { provider: 'cohere', regex: /"github\.com\/cohere-ai\/cohere-go(?:\/v\d+)?"/g },
    { provider: 'langchain', regex: /"github\.com\/tmc\/langchaingo(?:\/[a-z0-9-]+)*"/g },
    { provider: 'ollama', regex: /"github\.com\/ollama\/ollama(?:\/[a-z0-9-]+)*"/g },
  ],
  // Anthropic Go SDK uses System: <string>, OpenAI Go uses Role/Content struct fields.
  systemPromptKwargPatterns: [
    /\b[Ss]ystem\s*:\s*"([^"\n]{40,})"/g,
    /\bRole\s*:\s*"system"\s*,\s*Content\s*:\s*"([^"\n]{40,})"/g,
  ],
};
