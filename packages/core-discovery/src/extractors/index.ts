import { llmCallSitesExtractor } from './llm-call-sites.js';
import { modelStringsExtractor } from './model-strings.js';
import { ragConfigExtractor } from './rag-config.js';
import { sdkImportsExtractor } from './sdk-imports.js';
import { secretCandidatesExtractor } from './secret-candidates.js';
import { systemPromptsExtractor } from './system-prompts.js';
import { toolDefinitionsExtractor } from './tool-definitions.js';
import type { Extractor } from './types.js';

export type { Extractor, ExtractorInput } from './types.js';

/**
 * Frozen list of every bundled extractor. Each entry handles exactly
 * one artifact kind and consumes only the language registry plus the
 * file content; nothing here knows about specific file extensions.
 */
export const BUILTIN_EXTRACTORS: readonly Extractor[] = Object.freeze([
  sdkImportsExtractor,
  llmCallSitesExtractor,
  modelStringsExtractor,
  secretCandidatesExtractor,
  systemPromptsExtractor,
  toolDefinitionsExtractor,
  ragConfigExtractor,
]);
