import type { DiscoveryArtifact } from '@audithex/core-types';
import type { Extractor, ExtractorInput } from './types.js';
import { offsetToLineColumn } from './utils.js';

/**
 * Detects imports of known LLM SDKs across every language registered in
 * `@audithex/core-languages`. The language registry owns the regexes —
 * this extractor only iterates them and emits artifacts. Adding a new
 * provider or language never requires editing this file.
 */
export const sdkImportsExtractor: Extractor = {
  id: 'sdk-imports',
  extract(input: ExtractorInput): DiscoveryArtifact[] {
    const out: DiscoveryArtifact[] = [];
    for (const pattern of input.language.sdkImportPatterns) {
      pattern.regex.lastIndex = 0;
      for (const match of input.content.matchAll(pattern.regex)) {
        const matchText = match[0];
        const capture = match[1] ?? matchText;
        const index = match.index ?? 0;
        const { line, column } = offsetToLineColumn(input.content, index);
        out.push({
          kind: 'sdk-import',
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
            importPath: capture,
            language: input.language.id,
          },
        });
      }
    }
    return out;
  },
};
