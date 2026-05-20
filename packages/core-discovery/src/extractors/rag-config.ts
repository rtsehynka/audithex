import type { DiscoveryArtifact } from '@audithex/core-types';
import type { Extractor, ExtractorInput } from './types.js';
import { isCommentLineAt, offsetToLineColumn } from './utils.js';

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

    VECTOR_STORE_REGEX.lastIndex = 0;
    for (const match of input.content.matchAll(VECTOR_STORE_REGEX)) {
      const index = match.index ?? 0;
      if (
        input.language.capabilities.scansAsCode &&
        isCommentLineAt(input.content, index, input.language.lineCommentPrefixes)
      ) {
        continue;
      }
      const matchText = match[0];
      const system = matchText.toLowerCase() === 'lance' ? 'lance' : matchText.toLowerCase();
      const { line, column } = offsetToLineColumn(input.content, index);
      out.push({
        kind: 'rag-config',
        confidence: 'regex',
        location: {
          file: input.relPath,
          line,
          column,
          endLine: line,
          endColumn: column + matchText.length,
        },
        detail: {
          system,
          language: input.language.id,
        },
      });
    }

    EMBEDDING_REGEX.lastIndex = 0;
    for (const match of input.content.matchAll(EMBEDDING_REGEX)) {
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
        kind: 'rag-config',
        confidence: 'regex',
        location: {
          file: input.relPath,
          line,
          column,
          endLine: line,
          endColumn: column + matchText.length,
        },
        detail: {
          system: 'unknown',
          embeddingModel: matchText,
          language: input.language.id,
        },
      });
    }
    return out;
  },
};
