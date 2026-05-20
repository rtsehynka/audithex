import type { DiscoveryArtifact } from '@audithex/core-types';
import ts from 'typescript';
import { lineColumnOf, makeAstOrRegexExtractor, walkTsSourceFile } from './ts-ast.js';
import type { ExtractorInput } from './types.js';
import { offsetToLineColumn } from './utils.js';

/**
 * Detects imports of known LLM SDKs.
 *
 * TS/JS (preferredParser === 'ts-compiler') walks the AST and consults
 * the `modulePattern` regex on each `SdkImportPattern` — confidence
 * comes back tagged `'ast'`. Every other language stays on the full-line
 * `regex` field over file content and is tagged `'regex'`.
 */
export const sdkImportsExtractor = makeAstOrRegexExtractor(
  'sdk-imports',
  extractFromAst,
  extractFromRegex,
);

function extractFromAst(input: ExtractorInput): DiscoveryArtifact[] {
  return walkTsSourceFile(input, (node, source, push) => {
    const hit = tryImportDeclaration(node) ?? tryRequireCall(node);
    if (!hit) return;
    for (const pattern of input.language.sdkImportPatterns) {
      const probe = pattern.modulePattern;
      if (!probe) continue;
      if (!probe.test(hit.module)) continue;
      const { line, column } = lineColumnOf(source, hit.start);
      push({
        kind: 'sdk-import',
        confidence: 'ast',
        location: {
          file: input.relPath,
          line,
          column,
          endLine: line,
          endColumn: column + hit.module.length + 2,
        },
        detail: {
          provider: pattern.provider,
          importPath: hit.module,
          language: input.language.id,
          syntax: hit.syntax,
        },
      });
      break;
    }
  });
}

interface AstImportHit {
  module: string;
  start: number;
  syntax: 'import' | 'require';
}

function tryImportDeclaration(node: ts.Node): AstImportHit | null {
  if (!ts.isImportDeclaration(node)) return null;
  const spec = node.moduleSpecifier;
  if (!ts.isStringLiteral(spec)) return null;
  return { module: spec.text, start: spec.getStart(), syntax: 'import' };
}

function tryRequireCall(node: ts.Node): AstImportHit | null {
  if (!ts.isCallExpression(node)) return null;
  if (!ts.isIdentifier(node.expression) || node.expression.text !== 'require') return null;
  const arg = node.arguments[0];
  if (!arg || !ts.isStringLiteral(arg)) return null;
  return { module: arg.text, start: arg.getStart(), syntax: 'require' };
}

function extractFromRegex(input: ExtractorInput): DiscoveryArtifact[] {
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
}
