import { MODEL_PATTERNS } from '@audithex/core-languages';
import type { DiscoveryArtifact } from '@audithex/core-types';
import type { Extractor, ExtractorInput } from './types.js';
import { isCommentLineAt, offsetToLineColumn } from './utils.js';

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
      pattern.regex.lastIndex = 0;
      for (const match of input.content.matchAll(pattern.regex)) {
        const index = match.index ?? 0;
        if (
          input.language.capabilities.scansAsCode &&
          isCommentLineAt(input.content, index, input.language.lineCommentPrefixes)
        ) {
          continue;
        }
        const matchText = match[0];
        const { line, column } = offsetToLineColumn(input.content, index);
        out.push({
          kind: 'model-string',
          confidence: 'regex',
          location: {
            file: input.relPath,
            line,
            column,
            endLine: line,
            endColumn: column + matchText.length,
          },
          detail: {
            modelId: matchText,
            provider: pattern.provider,
            language: input.language.id,
          },
        });
      }
    }
    return out;
  },
};
