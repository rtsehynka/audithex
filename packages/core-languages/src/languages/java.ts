import type { LanguageDefinition } from '../types.js';

export const java: LanguageDefinition = {
  id: 'java',
  displayName: 'Java',
  extensions: ['.java'],
  capabilities: {
    preferredParser: 'regex',
    scansAsCode: true,
  },
  lineCommentPrefixes: ['//', '*', '/*'],
  sdkImportPatterns: [
    {
      provider: 'anthropic',
      regex: /^\s*import\s+com\.anthropic\.[A-Za-z0-9_.]+\s*;/gm,
    },
    {
      provider: 'openai',
      regex: /^\s*import\s+com\.(?:theokanning|openai)\.openai\.[A-Za-z0-9_.]+\s*;/gm,
    },
    {
      provider: 'google',
      regex: /^\s*import\s+com\.google\.cloud\.(?:aiplatform|vertexai)\.[A-Za-z0-9_.]+\s*;/gm,
    },
    {
      provider: 'langchain',
      regex: /^\s*import\s+dev\.langchain4j\.[A-Za-z0-9_.]+\s*;/gm,
    },
  ],
};
