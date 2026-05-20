import type { DiscoveryArtifact } from '@audithex/core-types';
import type { Extractor, ExtractorInput } from './types.js';
import { offsetToLineColumn } from './utils.js';

/**
 * Recognises files that read as a stand-alone system prompt: long
 * enough to be a prompt (>= 200 chars), opening with a recognisable
 * role-setting phrase, and located in a plain-text bucket (.md, .txt,
 * .prompt, etc.). Code-embedded prompts (`system: "…"` inside an SDK
 * call) are handled by a follow-up AST extractor in week 2.5.
 */
const MIN_PROMPT_LENGTH = 200;
const ROLE_PATTERN = /^(?:\s*(?:#{1,6}\s*)?)(?:You are|Your task|ROLE:|System:|Instructions?:)\b/im;

export const systemPromptsExtractor: Extractor = {
  id: 'system-prompts',
  extract(input: ExtractorInput): DiscoveryArtifact[] {
    // Limit to plain-text bucket; code-embedded prompts come later.
    if (input.language.capabilities.scansAsCode) return [];
    if (input.content.length < MIN_PROMPT_LENGTH) return [];
    const match = ROLE_PATTERN.exec(input.content);
    if (!match) return [];

    const { line, column } = offsetToLineColumn(input.content, match.index);
    const preview = input.content.slice(0, 160).replace(/\s+/g, ' ').trim();
    return [
      {
        kind: 'system-prompt',
        confidence: 'regex',
        location: {
          file: input.relPath,
          line,
          column,
        },
        detail: {
          origin: 'standalone-file',
          preview,
          characterCount: input.content.length,
          language: input.language.id,
        },
      },
    ];
  },
};
