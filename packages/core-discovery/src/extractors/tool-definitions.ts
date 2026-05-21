import type { DiscoveryArtifact } from '@audithex/core-types';
import ts from 'typescript';
import {
  lineColumnOf,
  literalText,
  makeAstOrRegexExtractor,
  propertyName,
  walkTsSourceFile,
} from './ts-ast.js';
import type { ExtractorInput } from './types.js';
import { offsetToLineColumn } from './utils.js';

/**
 * Detects tool / function definitions in the two ecosystem-standard
 * shapes:
 *
 *   - OpenAI:    { type: 'function', function: { name: '…', description?: '…', parameters?: { properties?: … } } }
 *   - Anthropic: { name: '…', description?: '…', input_schema: { properties?: … } }
 *
 * TS/JS files are parsed via the TypeScript Compiler API — object
 * literals are walked and inspected by property name, so tool
 * definitions written in code (not just JSON) are detected with
 * `confidence: 'ast'`. Every other language (including JSON, the
 * canonical home of tool manifests) keeps the existing regex pass
 * with `confidence: 'regex'`.
 */
export const toolDefinitionsExtractor = makeAstOrRegexExtractor(
  'tool-definitions',
  extractFromAst,
  extractFromRegex,
);

function extractFromAst(input: ExtractorInput): DiscoveryArtifact[] {
  return walkTsSourceFile(input, (node, source, push) => {
    if (!ts.isObjectLiteralExpression(node)) return;
    const tool = inspectObjectLiteral(node);
    if (!tool) return;
    const { line, column } = lineColumnOf(source, node.getStart(source));
    push({
      kind: 'tool-definition',
      confidence: 'ast',
      location: { file: input.relPath, line, column },
      detail: {
        toolName: tool.name,
        framework: tool.framework,
        hasDescription: tool.hasDescription,
        hasSchema: tool.hasSchema,
        requiresApproval: tool.requiresApproval,
        language: input.language.id,
      },
    });
  });
}

interface AstToolShape {
  name: string;
  framework: 'openai' | 'anthropic';
  hasDescription: boolean;
  hasSchema: boolean;
  /**
   * True when the tool definition explicitly carries an approval /
   * human-in-the-loop gate (`requiresApproval: true`, `humanInTheLoop`,
   * `confirmation`, `approval_required`, `needs_approval`). Used by
   * R016 to spot destructive-named tools without a guard.
   */
  requiresApproval: boolean;
}

/** Property names treated as "needs human approval before invocation." */
const APPROVAL_FLAG_KEYS = [
  'requiresApproval',
  'humanInTheLoop',
  'confirmation',
  'approval_required',
  'needs_approval',
  'confirm_before_use',
];

function inspectObjectLiteral(obj: ts.ObjectLiteralExpression): AstToolShape | null {
  const props = collectKnownProperties(obj);
  if (props.type === 'function' && props.functionBody) {
    const inner = collectKnownProperties(props.functionBody);
    if (!inner.name) return null;
    const params = inner.parametersBody ?? null;
    const hasSchema = params ? objectHasProperty(params, 'properties') : false;
    return {
      name: inner.name,
      framework: 'openai',
      hasDescription: typeof inner.description === 'string' && inner.description.length > 0,
      hasSchema,
      requiresApproval: objectHasApprovalFlag(props.functionBody) || objectHasApprovalFlag(obj),
    };
  }
  if (props.name && props.inputSchemaBody) {
    return {
      name: props.name,
      framework: 'anthropic',
      hasDescription: typeof props.description === 'string' && props.description.length > 0,
      hasSchema: objectHasProperty(props.inputSchemaBody, 'properties'),
      requiresApproval: objectHasApprovalFlag(obj),
    };
  }
  return null;
}

function objectHasApprovalFlag(obj: ts.ObjectLiteralExpression): boolean {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = propertyName(prop);
    if (!key || !APPROVAL_FLAG_KEYS.includes(key)) continue;
    if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) return true;
    const t = literalText(prop.initializer);
    if (typeof t === 'string' && t.length > 0 && t.toLowerCase() !== 'false') return true;
  }
  return false;
}

interface CollectedProps {
  type?: string;
  name?: string;
  description?: string;
  functionBody?: ts.ObjectLiteralExpression;
  parametersBody?: ts.ObjectLiteralExpression;
  inputSchemaBody?: ts.ObjectLiteralExpression;
}

function collectKnownProperties(obj: ts.ObjectLiteralExpression): CollectedProps {
  const out: CollectedProps = {};
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = propertyName(prop);
    if (!key) continue;
    if (key === 'type') {
      const v = literalText(prop.initializer);
      if (v !== null) out.type = v;
    } else if (key === 'name') {
      const v = literalText(prop.initializer);
      if (v !== null) out.name = v;
    } else if (key === 'description') {
      const v = literalText(prop.initializer);
      if (v !== null) out.description = v;
    } else if (key === 'function' && ts.isObjectLiteralExpression(prop.initializer)) {
      out.functionBody = prop.initializer;
    } else if (key === 'parameters' && ts.isObjectLiteralExpression(prop.initializer)) {
      out.parametersBody = prop.initializer;
    } else if (key === 'input_schema' && ts.isObjectLiteralExpression(prop.initializer)) {
      out.inputSchemaBody = prop.initializer;
    }
  }
  return out;
}

function objectHasProperty(obj: ts.ObjectLiteralExpression, name: string): boolean {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (propertyName(prop) === name) return true;
  }
  return false;
}

const OPENAI_TOOL =
  /"type"\s*:\s*"function"[\s\S]{0,40}?"function"\s*:\s*\{[\s\S]*?"name"\s*:\s*"([A-Za-z0-9_\-.]+)"/g;
const ANTHROPIC_TOOL = /"name"\s*:\s*"([A-Za-z0-9_\-.]+)"[\s\S]{0,400}?"input_schema"\s*:/g;

function extractFromRegex(input: ExtractorInput): DiscoveryArtifact[] {
  const out: DiscoveryArtifact[] = [];
  out.push(...findShape(input, OPENAI_TOOL, 'openai'));
  out.push(...findShape(input, ANTHROPIC_TOOL, 'anthropic'));
  return out;
}

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

    const anchor =
      framework === 'openai'
        ? findInnerFunctionBrace(matchIndex, matchText)
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
    const requiresApproval = APPROVAL_FLAG_KEYS.some((k) =>
      new RegExp(`"${k}"\\s*:\\s*(?:true|"true"|1)\\b`).test(body),
    );

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
        requiresApproval,
        language: input.language.id,
      },
    });
  }
  return out;
}

function findInnerFunctionBrace(matchStart: number, matchText: string): number {
  const fnOffset = matchText.search(/"function"\s*:\s*\{/);
  if (fnOffset === -1) return -1;
  const slice = matchText.slice(fnOffset);
  const braceOffset = slice.indexOf('{');
  if (braceOffset === -1) return -1;
  return matchStart + fnOffset + braceOffset;
}

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
