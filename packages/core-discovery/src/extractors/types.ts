import type { LanguageDefinition } from '@audithex/core-languages';
import type { DiscoveryArtifact } from '@audithex/core-types';

/**
 * Input passed to every extractor for a single source file.
 *
 * Extractors are pure functions: same input → same output. They MUST
 * NOT perform IO besides what is already in `content`. The walker is
 * responsible for reading files once and dispatching to extractors.
 */
export interface ExtractorInput {
  /** Project root, absolute path. */
  rootPath: string;
  /** File path relative to rootPath, forward-slash normalised. */
  relPath: string;
  /** Lowercase file extension including the leading dot. */
  extension: string;
  /** UTF-8 file contents. */
  content: string;
  /** Language registry entry resolved for this file. */
  language: LanguageDefinition;
}

/**
 * One extractor focuses on one artifact kind. Cross-language coverage
 * is achieved by routing through `@audithex/core-languages` patterns —
 * never by branching on language id inside the extractor.
 */
export interface Extractor {
  /** Stable id used in diagnostics and tests. */
  id: string;
  /**
   * Return any artifacts found in this file. Empty array = nothing
   * matched (this is the common case and is not an error).
   */
  extract(input: ExtractorInput): DiscoveryArtifact[];
}
