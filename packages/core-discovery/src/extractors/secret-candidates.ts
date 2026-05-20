import { SECRET_PATTERNS } from '@audithex/core-languages';
import type { DiscoveryArtifact } from '@audithex/core-types';
import type { Extractor, ExtractorInput } from './types.js';
import { isCommentLineAt, offsetToLineColumn, redact } from './utils.js';

/**
 * Flags string literals that look like published API keys for any
 * provider tracked in the language registry. Unlike rule R001, this
 * extractor runs on every file the walker yields — including config
 * and `.env` files — because secrets routinely sit there. The
 * extractor only records the candidate; downstream rules decide how
 * to react.
 */
export const secretCandidatesExtractor: Extractor = {
  id: 'secret-candidates',
  extract(input: ExtractorInput): DiscoveryArtifact[] {
    const out: DiscoveryArtifact[] = [];
    for (const pattern of SECRET_PATTERNS) {
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
          kind: 'secret-candidate',
          confidence: 'regex',
          location: {
            file: input.relPath,
            line,
            column,
            endLine: line,
            endColumn: column + matchText.length,
          },
          detail: {
            provider: pattern.provider,
            redactedPreview: redact(matchText),
            language: input.language.id,
          },
        });
      }
    }
    return out;
  },
};
