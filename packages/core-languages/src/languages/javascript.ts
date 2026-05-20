import type { LanguageDefinition } from '../types.js';

export const javascript: LanguageDefinition = {
  id: 'javascript',
  displayName: 'JavaScript',
  extensions: ['.js', '.jsx', '.mjs', '.cjs'],
  capabilities: {
    preferredParser: 'ts-compiler',
    scansAsCode: true,
  },
  lineCommentPrefixes: ['//', '*', '/*'],
  sdkImportPatterns: [
    {
      provider: 'anthropic',
      regex: /(?:from\s+['"]@anthropic-ai\/sdk['"]|require\(['"]@anthropic-ai\/sdk['"]\))/g,
      modulePattern: /^@anthropic-ai\/sdk$/,
    },
    {
      provider: 'openai',
      regex: /(?:from\s+['"]openai['"]|require\(['"]openai['"]\))/g,
      modulePattern: /^openai$/,
    },
    {
      provider: 'google',
      regex:
        /(?:from\s+['"](?:@google\/generative-ai|@google-cloud\/vertexai)['"]|require\(['"](?:@google\/generative-ai|@google-cloud\/vertexai)['"]\))/g,
      modulePattern: /^(?:@google\/generative-ai|@google-cloud\/vertexai)$/,
    },
    {
      provider: 'langchain',
      regex:
        /(?:from\s+['"](@langchain\/[a-z0-9-]+)['"]|require\(['"](@langchain\/[a-z0-9-]+)['"]\))/g,
      modulePattern: /^@langchain\/[a-z0-9-]+$/,
    },
    {
      provider: 'llamaindex',
      regex: /(?:from\s+['"]llamaindex['"]|require\(['"]llamaindex['"]\))/g,
      modulePattern: /^llamaindex$/,
    },
    {
      provider: 'vercel-ai',
      regex:
        /(?:from\s+['"](ai|@ai-sdk\/[a-z0-9-]+)['"]|require\(['"](ai|@ai-sdk\/[a-z0-9-]+)['"]\))/g,
      modulePattern: /^(?:ai|@ai-sdk\/[a-z0-9-]+)$/,
    },
    {
      provider: 'ollama',
      regex: /(?:from\s+['"]ollama['"]|require\(['"]ollama['"]\))/g,
      modulePattern: /^ollama$/,
    },
  ],
};
