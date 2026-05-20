import type { LanguageDefinition } from '../types.js';

export const typescript: LanguageDefinition = {
  id: 'typescript',
  displayName: 'TypeScript',
  extensions: ['.ts', '.tsx', '.mts', '.cts'],
  capabilities: {
    preferredParser: 'ts-compiler',
    scansAsCode: true,
  },
  lineCommentPrefixes: ['//', '*', '/*'],
  sdkImportPatterns: [
    { provider: 'anthropic', regex: /from\s+['"](@anthropic-ai\/sdk)['"]/g },
    { provider: 'openai', regex: /from\s+['"](openai)['"]/g },
    {
      provider: 'google',
      regex: /from\s+['"](@google\/generative-ai|@google-cloud\/vertexai)['"]/g,
    },
    { provider: 'mistral', regex: /from\s+['"](@mistralai\/mistralai)['"]/g },
    { provider: 'cohere', regex: /from\s+['"](cohere-ai)['"]/g },
    { provider: 'langchain', regex: /from\s+['"](@langchain\/[a-z0-9-]+)['"]/g },
    { provider: 'llamaindex', regex: /from\s+['"](llamaindex)['"]/g },
    { provider: 'vercel-ai', regex: /from\s+['"](ai|@ai-sdk\/[a-z0-9-]+)['"]/g },
    { provider: 'mastra', regex: /from\s+['"](@mastra\/[a-z0-9-]+)['"]/g },
    { provider: 'ollama', regex: /from\s+['"](ollama)['"]/g },
  ],
};
