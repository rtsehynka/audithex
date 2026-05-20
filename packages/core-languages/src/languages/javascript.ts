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
    },
    { provider: 'openai', regex: /(?:from\s+['"]openai['"]|require\(['"]openai['"]\))/g },
    {
      provider: 'google',
      regex:
        /(?:from\s+['"](?:@google\/generative-ai|@google-cloud\/vertexai)['"]|require\(['"](?:@google\/generative-ai|@google-cloud\/vertexai)['"]\))/g,
    },
    {
      provider: 'langchain',
      regex:
        /(?:from\s+['"](@langchain\/[a-z0-9-]+)['"]|require\(['"](@langchain\/[a-z0-9-]+)['"]\))/g,
    },
    {
      provider: 'llamaindex',
      regex: /(?:from\s+['"]llamaindex['"]|require\(['"]llamaindex['"]\))/g,
    },
    {
      provider: 'vercel-ai',
      regex:
        /(?:from\s+['"](ai|@ai-sdk\/[a-z0-9-]+)['"]|require\(['"](ai|@ai-sdk\/[a-z0-9-]+)['"]\))/g,
    },
    { provider: 'ollama', regex: /(?:from\s+['"]ollama['"]|require\(['"]ollama['"]\))/g },
  ],
};
