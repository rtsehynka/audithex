import type { LanguageDefinition } from '../types.js';

export const ruby: LanguageDefinition = {
  id: 'ruby',
  displayName: 'Ruby',
  extensions: ['.rb'],
  capabilities: {
    preferredParser: 'regex',
    scansAsCode: true,
  },
  lineCommentPrefixes: ['#'],
  sdkImportPatterns: [
    { provider: 'anthropic', regex: /^\s*require\s+['"]anthropic['"]/gm },
    { provider: 'openai', regex: /^\s*require\s+['"]ruby-openai['"]/gm },
    { provider: 'cohere', regex: /^\s*require\s+['"]cohere-ruby['"]/gm },
    { provider: 'langchain', regex: /^\s*require\s+['"]langchainrb['"]/gm },
  ],
};
