import type { DiscoveryArtifact } from '@audithex/core-types';
import ts from 'typescript';
import { lineColumnOf, makeAstOrRegexExtractor, walkTsSourceFile } from './ts-ast.js';
import type { ExtractorInput } from './types.js';

/**
 * Detects call sites that actually invoke an LLM, complementing the
 * sdk-imports extractor. Two signals matter:
 *
 *   1. Native SDK methods (`*.messages.create`, `*.chat.completions.create`,
 *      `*.generateContent`, `*.generateContentStream`, `*.invokeWithTools`,
 *      `*.invokeImage`, `*.streamText`, `*.generateText`).
 *   2. Hand-rolled HTTP clients targeting known provider endpoints
 *      (`api.anthropic.com`, `api.openai.com`, `:generateContent`,
 *      `/v1/messages`, `/v1/chat/completions`, etc.) — these escape
 *      `sdk-imports` because the project never imports the official SDK.
 *
 * Generic `*.invoke()` / `*.stream()` only fire when the receiver name
 * looks AI-shaped (`ai`, `llm`, `aiDispatch`, `anthropicClient`, ...);
 * keeping the heuristic tight here matters because plenty of business
 * code defines an `invoke` method on unrelated services.
 *
 * Used by `regex-in-code` to put a package into AI-context for rules
 * that gate on `requiresAiContext`. Confidence reflects how the match
 * was reached — AST in TS/JS, regex everywhere else.
 */

const URL_FRAGMENT_RE =
  /(?:api\.anthropic\.com|api\.openai\.com|api\.cohere\.com|api\.mistral\.ai|generativelanguage\.googleapis\.com|openrouter\.ai\/api|\/v1\/messages|\/v1\/chat\/completions|\/v1\/completions|\/v1\/images\/generations|:generateContent)/i;

const AI_RECEIVER_RE =
  /(?:^|[.\s])(?:ai|llm|anthropic|openai|gemini|cohere|mistral|claude|bedrock|aiDispatch|aiClient|aiHost|aiAgent)\w*$/i;

const SDK_HIGH_PRECISION_METHODS = new Set([
  'generateContent',
  'generateContentStream',
  'invokeWithTools',
  'invokeImage',
  'streamText',
  'generateText',
]);

const INVOKE_METHODS = new Set(['invoke', 'stream']);
const HTTP_METHODS = new Set(['post', 'get', 'put', 'patch', 'request']);

export const llmCallSitesExtractor = makeAstOrRegexExtractor(
  'llm-call-sites',
  extractFromAst,
  extractFromRegex,
);

function extractFromAst(input: ExtractorInput): DiscoveryArtifact[] {
  return walkTsSourceFile(input, (node, source, push) => {
    if (!ts.isCallExpression(node)) return;
    const callee = node.expression;

    // fetch(url, ...)
    if (ts.isIdentifier(callee) && callee.text === 'fetch' && node.arguments.length > 0) {
      const arg0 = node.arguments[0];
      if (!arg0) return;
      const argText = arg0.getText(source);
      if (URL_FRAGMENT_RE.test(argText)) {
        emit(node, source, push, 'http-endpoint', argText.slice(0, 80));
      }
      return;
    }

    if (!ts.isPropertyAccessExpression(callee)) return;

    const methodName = callee.name.text;
    const receiverText = callee.expression.getText(source);

    // .messages.create / .completions.create / .chat.completions.create
    if (methodName === 'create' && /\b(?:messages|completions)$/.test(receiverText)) {
      emit(node, source, push, 'sdk-method', `${receiverText}.${methodName}`);
      return;
    }

    // High-precision SDK methods
    if (SDK_HIGH_PRECISION_METHODS.has(methodName)) {
      emit(node, source, push, 'sdk-method', `${receiverText}.${methodName}`);
      return;
    }

    // .invoke() / .stream() — only when receiver looks AI-shaped
    if (INVOKE_METHODS.has(methodName) && AI_RECEIVER_RE.test(receiverText)) {
      emit(node, source, push, 'invoke-method', `${receiverText}.${methodName}`);
      return;
    }

    // axios.post / axios.get / etc. with an LLM endpoint URL
    if (
      HTTP_METHODS.has(methodName) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === 'axios' &&
      node.arguments.length > 0
    ) {
      const arg0 = node.arguments[0];
      if (!arg0) return;
      const argText = arg0.getText(source);
      if (URL_FRAGMENT_RE.test(argText)) {
        emit(node, source, push, 'http-endpoint', argText.slice(0, 80));
      }
    }
  });
}

function emit(
  node: ts.Node,
  source: ts.SourceFile,
  push: (a: DiscoveryArtifact) => void,
  callShape: 'sdk-method' | 'invoke-method' | 'http-endpoint',
  target: string,
): void {
  const start = node.getStart(source);
  const end = node.getEnd();
  const { line, column } = lineColumnOf(source, start);
  const { line: endLine, column: endColumn } = lineColumnOf(source, end);
  push({
    kind: 'llm-call-site',
    confidence: 'ast',
    location: {
      file: source.fileName,
      line,
      column,
      endLine,
      endColumn,
    },
    detail: {
      callShape,
      target,
    },
  });
}

function extractFromRegex(input: ExtractorInput): DiscoveryArtifact[] {
  const out: DiscoveryArtifact[] = [];
  const lines = input.content.split(/\r?\n/);
  const SDK_METHOD_LINE_RE =
    /\b(?:messages|chat\.completions|completions)\.create\s*\(|\b(?:generateContent|generateContentStream|invokeWithTools|invokeImage|streamText|generateText)\s*\(/;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const httpHit = URL_FRAGMENT_RE.test(line);
    const sdkHit = SDK_METHOD_LINE_RE.test(line);
    if (!httpHit && !sdkHit) continue;
    out.push({
      kind: 'llm-call-site',
      confidence: 'regex',
      location: {
        file: input.relPath,
        line: i + 1,
        column: 1,
        endLine: i + 1,
        endColumn: line.length + 1,
      },
      detail: {
        callShape: httpHit ? 'http-endpoint' : 'sdk-method',
        target: line.trim().slice(0, 80),
      },
    });
  }
  return out;
}
