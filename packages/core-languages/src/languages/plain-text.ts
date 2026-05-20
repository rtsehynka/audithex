import type { LanguageDefinition } from '../types.js';

/**
 * Plain text bucket for files that may carry system prompts or RAG content
 * but are not compiled code (Markdown, plain prompt files, YAML configs).
 */
export const plainText: LanguageDefinition = {
  id: 'plain-text',
  displayName: 'Plain Text',
  extensions: [
    '.md',
    '.mdx',
    '.txt',
    '.prompt',
    '.yaml',
    '.yml',
    '.json',
    '.json5',
    '.toml',
    '.env',
  ],
  capabilities: {
    preferredParser: 'regex',
    scansAsCode: false,
  },
  lineCommentPrefixes: ['#', '<!--'],
  sdkImportPatterns: [],
};
