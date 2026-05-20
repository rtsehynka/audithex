import type { DiscoveryArtifact } from '@audithex/core-types';
import ts from 'typescript';
import { createTsSourceFile, lineColumnOf, literalText, propertyName, walk } from './ts-ast.js';
import type { Extractor, ExtractorInput } from './types.js';
import { offsetToLineColumn } from './utils.js';

/**
 * Recognises system prompts at two origins:
 *
 *   1. Standalone files (.md/.txt/.prompt …): long enough to read as a
 *      prompt (>= 200 chars), opening with a role-setting phrase.
 *   2. Code-embedded `system:` kwargs (or OpenAI-style
 *      `{role: 'system', content: ...}`) inside SDK calls. For TS/JS
 *      the extractor walks the TS Compiler AST; for other code
 *      languages it consumes regex patterns owned by the language
 *      registry.
 */
const MIN_STANDALONE_LENGTH = 200;
const MIN_EMBEDDED_LENGTH = 40;
const ROLE_PATTERN = /^(?:\s*(?:#{1,6}\s*)?)(?:You are|Your task|ROLE:|System:|Instructions?:)\b/im;
const PREVIEW_LENGTH = 160;

export const systemPromptsExtractor: Extractor = {
  id: 'system-prompts',
  extract(input: ExtractorInput): DiscoveryArtifact[] {
    if (!input.language.capabilities.scansAsCode) {
      return extractStandalone(input);
    }
    if (input.language.capabilities.preferredParser === 'ts-compiler') {
      return extractFromTsAst(input);
    }
    return extractCodeEmbeddedRegex(input);
  },
};

function extractStandalone(input: ExtractorInput): DiscoveryArtifact[] {
  if (input.content.length < MIN_STANDALONE_LENGTH) return [];
  const match = ROLE_PATTERN.exec(input.content);
  if (!match) return [];
  const { line, column } = offsetToLineColumn(input.content, match.index);
  return [
    {
      kind: 'system-prompt',
      confidence: 'regex',
      location: { file: input.relPath, line, column },
      detail: {
        origin: 'standalone-file',
        preview: previewOf(input.content),
        characterCount: input.content.length,
        language: input.language.id,
      },
    },
  ];
}

function extractCodeEmbeddedRegex(input: ExtractorInput): DiscoveryArtifact[] {
  const patterns = input.language.systemPromptKwargPatterns;
  if (!patterns || patterns.length === 0) return [];
  const out: DiscoveryArtifact[] = [];
  for (const regex of patterns) {
    regex.lastIndex = 0;
    for (const match of input.content.matchAll(regex)) {
      const body = match[1];
      if (!body || body.length < MIN_EMBEDDED_LENGTH) continue;
      const bodyOffset = (match.index ?? 0) + match[0].indexOf(body);
      const { line, column } = offsetToLineColumn(input.content, bodyOffset);
      out.push(makeArtifact(input, body, line, column, 'regex'));
    }
  }
  return out;
}

function extractFromTsAst(input: ExtractorInput): DiscoveryArtifact[] {
  const source = createTsSourceFile(input);
  const out: DiscoveryArtifact[] = [];
  walk(source, (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      collectFromObjectLiteral(node, source, input, out);
    }
  });
  return out;
}

function collectFromObjectLiteral(
  obj: ts.ObjectLiteralExpression,
  source: ts.SourceFile,
  input: ExtractorInput,
  out: DiscoveryArtifact[],
): void {
  let roleIsSystem = false;
  let contentAssignment: ts.PropertyAssignment | null = null;
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = propertyName(prop);
    if (!name) continue;
    if (name === 'system') {
      const body = literalText(prop.initializer);
      if (body !== null && body.length >= MIN_EMBEDDED_LENGTH) {
        pushAstHit(prop.initializer, source, input, body, out);
      }
    } else if (name === 'role') {
      const value = literalText(prop.initializer);
      if (value === 'system') roleIsSystem = true;
    } else if (name === 'content') {
      contentAssignment = prop;
    }
  }
  if (roleIsSystem && contentAssignment) {
    const body = literalText(contentAssignment.initializer);
    if (body !== null && body.length >= MIN_EMBEDDED_LENGTH) {
      pushAstHit(contentAssignment.initializer, source, input, body, out);
    }
  }
}

function pushAstHit(
  literal: ts.Node,
  source: ts.SourceFile,
  input: ExtractorInput,
  body: string,
  out: DiscoveryArtifact[],
): void {
  const { line, column } = lineColumnOf(source, literal.getStart(source));
  out.push(makeArtifact(input, body, line, column, 'ast'));
}

function makeArtifact(
  input: ExtractorInput,
  body: string,
  line: number,
  column: number,
  confidence: 'ast' | 'regex',
): DiscoveryArtifact {
  return {
    kind: 'system-prompt',
    confidence,
    location: { file: input.relPath, line, column },
    detail: {
      origin: 'code-embedded',
      preview: previewOf(body),
      characterCount: body.length,
      language: input.language.id,
    },
  };
}

function previewOf(text: string): string {
  return text.slice(0, PREVIEW_LENGTH).replace(/\s+/g, ' ').trim();
}
