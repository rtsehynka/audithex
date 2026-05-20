import { MODEL_PATTERNS } from '@audithex/core-languages';
import type { DiscoveryArtifact } from '@audithex/core-types';
import type { Extractor, ExtractorInput } from './types.js';
import { iterateNonCommentMatches } from './utils.js';

/**
 * Detects literal model identifiers (`"claude-opus-4-7"`, `"gpt-4o"` …)
 * anywhere a string can legally appear. The pattern set is owned by the
 * language registry; this extractor is the only place that maps a
 * regex hit to a discovery artifact.
 */
export const modelStringsExtractor: Extractor = {
  id: 'model-strings',
  extract(input: ExtractorInput): DiscoveryArtifact[] {
    const out: DiscoveryArtifact[] = [];
    for (const pattern of MODEL_PATTERNS) {
      for (const hit of iterateNonCommentMatches(
        input.content,
        pattern.regex,
        input.language.lineCommentPrefixes,
        input.language.capabilities.scansAsCode,
      )) {
        out.push({
          kind: 'model-string',
          confidence: 'regex',
          location: {
            file: input.relPath,
            line: hit.line,
            column: hit.column,
            endLine: hit.line,
            endColumn: hit.column + hit.text.length,
          },
          detail: {
            modelId: hit.text,
            provider: pattern.provider,
            language: input.language.id,
          },
        });
      }
    }
    return out;
  },
};
