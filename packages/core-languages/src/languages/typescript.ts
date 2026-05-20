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
    {
      provider: 'anthropic',
      regex: /from\s+['"](@anthropic-ai\/sdk)['"]/g,
      modulePattern: /^@anthropic-ai\/sdk$/,
    },
    {
      provider: 'openai',
      regex: /from\s+['"](openai)['"]/g,
      modulePattern: /^openai$/,
    },
    {
      provider: 'google',
      regex: /from\s+['"](@google\/generative-ai|@google-cloud\/vertexai)['"]/g,
      modulePattern: /^(?:@google\/generative-ai|@google-cloud\/vertexai)$/,
    },
    {
      provider: 'mistral',
      regex: /from\s+['"](@mistralai\/mistralai)['"]/g,
      modulePattern: /^@mistralai\/mistralai$/,
    },
    {
      provider: 'cohere',
      regex: /from\s+['"](cohere-ai)['"]/g,
      modulePattern: /^cohere-ai$/,
    },
    {
      provider: 'langchain',
      regex: /from\s+['"](@langchain\/[a-z0-9-]+)['"]/g,
      modulePattern: /^@langchain\/[a-z0-9-]+$/,
    },
    {
      provider: 'llamaindex',
      regex: /from\s+['"](llamaindex)['"]/g,
      modulePattern: /^llamaindex$/,
    },
    {
      provider: 'vercel-ai',
      regex: /from\s+['"](ai|@ai-sdk\/[a-z0-9-]+)['"]/g,
      modulePattern: /^(?:ai|@ai-sdk\/[a-z0-9-]+)$/,
    },
    {
      provider: 'mastra',
      regex: /from\s+['"](@mastra\/[a-z0-9-]+)['"]/g,
      modulePattern: /^@mastra\/[a-z0-9-]+$/,
    },
    {
      provider: 'ollama',
      regex: /from\s+['"](ollama)['"]/g,
      modulePattern: /^ollama$/,
    },
  ],
};
