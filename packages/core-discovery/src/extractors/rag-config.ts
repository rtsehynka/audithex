import type { DiscoveryArtifact } from '@audithex/core-types';
import type { Extractor, ExtractorInput } from './types.js';
import { type NonCommentMatch, iterateNonCommentMatches } from './utils.js';

/**
 * Detects RAG infrastructure in use: vector store SDKs and embedding
 * model identifiers. The set of vector stores is small and stable
 * enough across ecosystems that a single regex catches every host
 * language. Embedding model strings live alongside chunking literals
 * in the same code path and reuse the comment-skip helper.
 */
const VECTOR_STORE_REGEX = /\b(pinecone|chroma|qdrant|weaviate|pgvector|lance(?:db)?|milvus)\b/gi;
const EMBEDDING_REGEX = /\b(text-embedding-[a-z0-9-]+|voyage-[a-z0-9-]+|embed-[a-z0-9-]+)\b/g;

export const ragConfigExtractor: Extractor = {
  id: 'rag-config',
  extract(input: ExtractorInput): DiscoveryArtifact[] {
    const out: DiscoveryArtifact[] = [];
    const prefixes = input.language.lineCommentPrefixes;
    const treatAsCode = input.language.capabilities.scansAsCode;
    const push = (hit: NonCommentMatch, detail: Record<string, string>): void => {
      out.push({
        kind: 'rag-config',
        confidence: 'regex',
        location: {
          file: input.relPath,
          line: hit.line,
          column: hit.column,
          endLine: hit.line,
          endColumn: hit.column + hit.text.length,
        },
        detail: { ...detail, language: input.language.id },
      });
    };

    for (const hit of iterateNonCommentMatches(
      input.content,
      VECTOR_STORE_REGEX,
      prefixes,
      treatAsCode,
    )) {
      push(hit, { system: hit.text.toLowerCase() });
    }

    for (const hit of iterateNonCommentMatches(
      input.content,
      EMBEDDING_REGEX,
      prefixes,
      treatAsCode,
    )) {
      push(hit, { system: 'unknown', embeddingModel: hit.text });
    }

    return out;
  },
};
