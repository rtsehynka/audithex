import type { DiscoveryArtifact } from '@audithex/core-types';
import ts from 'typescript';
import type { Extractor, ExtractorInput } from './types.js';

/**
 * Shared TypeScript Compiler API helpers for extractors that need AST
 * confidence on .ts / .tsx / .js / .jsx / .mjs / .cjs files. Centralising
 * the source-file construction and literal/identifier accessors keeps
 * the per-extractor code small and the parser configuration consistent.
 */

export function createTsSourceFile(input: ExtractorInput): ts.SourceFile {
  return ts.createSourceFile(
    input.relPath,
    input.content,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    pickScriptKind(input.extension),
  );
}

export function pickScriptKind(extension: string): ts.ScriptKind {
  switch (extension) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

export interface LineColumn {
  line: number;
  column: number;
}

/**
 * Translates a `ts.SourceFile` zero-based position into the 1-based
 * line / column pair Audithex uses everywhere else.
 */
export function lineColumnOf(source: ts.SourceFile, position: number): LineColumn {
  const { line, character } = ts.getLineAndCharacterOfPosition(source, position);
  return { line: line + 1, column: character + 1 };
}

/**
 * Returns the literal string value for `node` when it is a string
 * literal, no-substitution template literal, or a single-character
 * template expression with no substitutions. Returns null for every
 * non-literal initializer (identifier reference, call expression,
 * concatenation, etc.) — extractors choose not to follow those.
 */
export function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

/**
 * Returns the literal name of a property assignment when it is an
 * identifier, string literal, or no-substitution template literal.
 * Computed property names and numeric keys come back as null.
 */
export function propertyName(prop: ts.PropertyAssignment): string | null {
  const name = prop.name;
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name)) return name.text;
  if (ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  return null;
}

export function walk(node: ts.Node, visitor: (n: ts.Node) => void): void {
  visitor(node);
  ts.forEachChild(node, (child) => walk(child, visitor));
}

export type AstVisitor = (
  node: ts.Node,
  source: ts.SourceFile,
  push: (artifact: DiscoveryArtifact) => void,
) => void;

/**
 * Parses `input` as a TypeScript source file, walks every node, and
 * collects every artifact the visitor pushes. Used by every TS/JS
 * AST extractor so the source-construction + walk + collect boilerplate
 * lives in one place.
 */
export function walkTsSourceFile(input: ExtractorInput, visitor: AstVisitor): DiscoveryArtifact[] {
  const source = createTsSourceFile(input);
  const out: DiscoveryArtifact[] = [];
  const push = (artifact: DiscoveryArtifact): void => {
    out.push(artifact);
  };
  walk(source, (node) => visitor(node, source, push));
  return out;
}

/**
 * Builds an extractor that dispatches by `preferredParser`: TS/JS files
 * go through the AST branch, everything else through the regex branch.
 * Keeps the per-extractor body focused on detection logic only.
 */
export function makeAstOrRegexExtractor(
  id: string,
  fromAst: (input: ExtractorInput) => DiscoveryArtifact[],
  fromRegex: (input: ExtractorInput) => DiscoveryArtifact[],
): Extractor {
  return {
    id,
    extract(input) {
      if (input.language.capabilities.preferredParser === 'ts-compiler') {
        return fromAst(input);
      }
      return fromRegex(input);
    },
  };
}
