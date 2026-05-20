import type { DiscoveryArtifact } from '@audithex/core-types';
import type { Extractor, ExtractorInput } from './types.js';
import { offsetToLineColumn } from './utils.js';

/**
 * Detects tool / function definitions in the two ecosystem-standard
 * shapes that show up across every language with an LLM SDK:
 *
 *   - OpenAI:    { "type": "function", "function": { "name": "...", ... } }
 *   - Anthropic: { "name": "...", "input_schema": {...} }
 *
 * Once a name-anchored hit is found the extractor brace-balances
 * outward to find the enclosing object literal, then inspects ONLY
 * that body for sibling fields. Without that step the `hasDescription`
 * / `hasSchema` flags leak into adjacent siblings in arrays of tools.
 */

const OPENAI_TOOL =
  /"type"\s*:\s*"function"[\s\S]{0,40}?"function"\s*:\s*\{[\s\S]*?"name"\s*:\s*"([A-Za-z0-9_\-.]+)"/g;
const ANTHROPIC_TOOL = /"name"\s*:\s*"([A-Za-z0-9_\-.]+)"[\s\S]{0,400}?"input_schema"\s*:/g;

export const toolDefinitionsExtractor: Extractor = {
  id: 'tool-definitions',
  extract(input: ExtractorInput): DiscoveryArtifact[] {
    const out: DiscoveryArtifact[] = [];
    out.push(...findShape(input, OPENAI_TOOL, 'openai'));
    out.push(...findShape(input, ANTHROPIC_TOOL, 'anthropic'));
    return out;
  },
};

function findShape(
  input: ExtractorInput,
  regex: RegExp,
  framework: 'openai' | 'anthropic',
): DiscoveryArtifact[] {
  regex.lastIndex = 0;
  const out: DiscoveryArtifact[] = [];
  for (const match of input.content.matchAll(regex)) {
    const matchIndex = match.index ?? 0;
    const matchText = match[0];
    const toolName = match[1] ?? 'unknown';

    // For OpenAI: anchor on the inner `function: {`, which is the tool
    // body. For Anthropic: anchor on the enclosing `{` immediately
    // before the `"name"` match.
    const anchor =
      framework === 'openai'
        ? findInnerFunctionBrace(input.content, matchIndex, matchText)
        : findPrecedingOpenBrace(input.content, matchIndex);
    if (anchor === -1) continue;

    const bodyEnd = findMatchingCloseBrace(input.content, anchor);
    if (bodyEnd === -1) continue;
    const body = input.content.slice(anchor, bodyEnd + 1);

    const hasDescription = /"description"\s*:\s*"[^"]+"/.test(body);
    const hasSchema =
      framework === 'openai'
        ? /"parameters"\s*:\s*\{[\s\S]*?"properties"\s*:/.test(body)
        : /"input_schema"\s*:\s*\{[\s\S]*?"properties"\s*:/.test(body);

    const { line, column } = offsetToLineColumn(input.content, matchIndex);
    out.push({
      kind: 'tool-definition',
      confidence: 'regex',
      location: {
        file: input.relPath,
        line,
        column,
        endLine: line,
        endColumn: column + matchText.length,
      },
      detail: {
        toolName,
        framework,
        hasDescription,
        hasSchema,
        language: input.language.id,
      },
    });
  }
  return out;
}

/**
 * Find the `{` that opens the `function: { ... }` block inside the
 * match. Returns the index of that brace within `content`.
 */
function findInnerFunctionBrace(_content: string, matchStart: number, matchText: string): number {
  const fnOffset = matchText.search(/"function"\s*:\s*\{/);
  if (fnOffset === -1) return -1;
  const slice = matchText.slice(fnOffset);
  const braceOffset = slice.indexOf('{');
  if (braceOffset === -1) return -1;
  return matchStart + fnOffset + braceOffset;
}

/**
 * Walk backwards from `from` (string-aware) to find the nearest `{`
 * that has no matching `}` yet — the start of the enclosing object.
 */
function findPrecedingOpenBrace(content: string, from: number): number {
  let depth = 0;
  for (let i = from - 1; i >= 0; i -= 1) {
    const ch = content[i];
    if (ch === '}') depth += 1;
    else if (ch === '{') {
      if (depth === 0) return i;
      depth -= 1;
    }
  }
  return -1;
}

/**
 * Forward brace-balance from a known `{` at `start`. String literals
 * are respected so braces inside `"foo}"` do not affect the count.
 * Returns the index of the matching `}`, or -1 if not found.
 */
function findMatchingCloseBrace(content: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < content.length; i += 1) {
    const ch = content[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}
