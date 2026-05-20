import { SECRET_PATTERNS } from '@audithex/core-languages';
import type { DiscoveryArtifact } from '@audithex/core-types';
import type { Extractor, ExtractorInput } from './types.js';
import { iterateNonCommentMatches, redact } from './utils.js';

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
      for (const hit of iterateNonCommentMatches(
        input.content,
        pattern.regex,
        input.language.lineCommentPrefixes,
        input.language.capabilities.scansAsCode,
      )) {
        out.push({
          kind: 'secret-candidate',
          confidence: 'regex',
          location: {
            file: input.relPath,
            line: hit.line,
            column: hit.column,
            endLine: hit.line,
            endColumn: hit.column + hit.text.length,
          },
          detail: {
            provider: pattern.provider,
            redactedPreview: redact(hit.text),
            language: input.language.id,
          },
        });
      }
    }
    return out;
  },
};
