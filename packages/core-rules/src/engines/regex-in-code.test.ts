import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { DiscoveryArtifact, DiscoveryResult, RuleDocument } from '@audithex/core-types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { regexInCodeEngine } from './regex-in-code.js';
import type { EngineContext } from './types.js';

interface TestFile {
  rel: string;
  content: string;
}

function writeTree(root: string, files: readonly TestFile[]): void {
  for (const f of files) {
    const abs = join(root, f.rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.content, 'utf8');
  }
}

function makeContext(
  rootPath: string,
  files: readonly TestFile[],
  artifacts: DiscoveryArtifact[] = [],
): EngineContext {
  const discovery: DiscoveryResult = {
    rootPath,
    scannedAt: new Date().toISOString(),
    summary: {
      totalFiles: files.length,
      byExtension: {},
      envFiles: 0,
      skippedByGitignore: 0,
      elapsedMs: 0,
    },
    files: files.map((f) => f.rel),
    artifacts,
  };
  return { discovery, patternBundles: new Map() };
}

function makeFetchRule(extra: Record<string, unknown> = {}): RuleDocument {
  return {
    _id: 'R008',
    schemaVersion: '0.1',
    severity: 'high',
    owasp: ['LLM05'],
    cwe: 'CWE-918',
    engine: 'regex-in-code',
    params: {
      skipComments: true,
      ...extra,
      inlinePatterns: [
        {
          id: 'node-fetch-template',
          languages: ['typescript', 'javascript'],
          regex: '\\bfetch\\s*\\(\\s*`[^`]*\\$\\{',
          messageParamKind: 'fetch with interpolated URL',
        },
      ],
    },
    messageKey: 'findings:R008.message',
    fixKey: 'findings:R008.fix',
  };
}

function sdkImportArtifact(file: string): DiscoveryArtifact {
  return {
    kind: 'sdk-import',
    confidence: 'ast',
    location: { file, line: 1, column: 1 },
    detail: { provider: 'anthropic', importPath: '@anthropic-ai/sdk' },
  };
}

describe('regexInCodeEngine', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'audithex-regex-engine-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('AI-context gating (Track A)', () => {
    it('fires inside a package that has an sdk-import artifact (file lives next to llm-call)', () => {
      const files: TestFile[] = [
        { rel: 'package.json', content: '{"name":"banking-bot"}' },
        { rel: 'src/llm-call.ts', content: "import OpenAI from 'openai';\n" },
        {
          rel: 'src/tools/http.ts',
          content: 'export async function go(id: string) {\n  return fetch(`/api/x/${id}`);\n}\n',
        },
      ];
      writeTree(root, files);
      const ctx = makeContext(root, files, [sdkImportArtifact('src/llm-call.ts')]);
      const findings = regexInCodeEngine.evaluate(makeFetchRule({ requiresAiContext: true }), ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.location.file).toBe('src/tools/http.ts');
    });

    it('skips packages that do not contain any sdk-import artifact', () => {
      const files: TestFile[] = [
        { rel: 'packages/ai/package.json', content: '{"name":"ai"}' },
        {
          rel: 'packages/ai/src/anthropic.ts',
          content: "import Anthropic from '@anthropic-ai/sdk';\n",
        },
        { rel: 'packages/wishlist/package.json', content: '{"name":"wishlist"}' },
        {
          rel: 'packages/wishlist/src/list.ts',
          content:
            'export async function remove(id: string) {\n  return fetch(`/api/wishlist/${id}`);\n}\n',
        },
      ];
      writeTree(root, files);
      const ctx = makeContext(root, files, [sdkImportArtifact('packages/ai/src/anthropic.ts')]);
      const findings = regexInCodeEngine.evaluate(makeFetchRule({ requiresAiContext: true }), ctx);
      expect(findings).toHaveLength(0);
    });

    it('without requiresAiContext fires regardless of sdk-import presence (backward compat)', () => {
      const files: TestFile[] = [
        { rel: 'package.json', content: '{"name":"plain-web-app"}' },
        {
          rel: 'src/api-client.ts',
          content: 'export async function get(id: string) {\n  return fetch(`/api/${id}`);\n}\n',
        },
      ];
      writeTree(root, files);
      const ctx = makeContext(root, files, []); // no sdk-import
      const findings = regexInCodeEngine.evaluate(makeFetchRule({}), ctx);
      expect(findings).toHaveLength(1);
    });
  });

  describe('inline suppression pragmas (Track B)', () => {
    it('suppresses everything on a line tagged with audithex-ignore-line', () => {
      const files: TestFile[] = [
        { rel: 'package.json', content: '{"name":"app"}' },
        { rel: 'src/sdk.ts', content: "import O from 'openai';\n" },
        {
          rel: 'src/client.ts',
          content:
            'export async function go(id: string) {\n  return fetch(`/api/${id}`); // audithex-ignore-line\n}\n',
        },
      ];
      writeTree(root, files);
      const ctx = makeContext(root, files, [sdkImportArtifact('src/sdk.ts')]);
      const findings = regexInCodeEngine.evaluate(makeFetchRule({ requiresAiContext: true }), ctx);
      expect(findings).toHaveLength(0);
    });

    it('suppresses the next non-blank line after audithex-ignore-next-line', () => {
      const files: TestFile[] = [
        { rel: 'package.json', content: '{"name":"app"}' },
        { rel: 'src/sdk.ts', content: "import O from 'openai';\n" },
        {
          rel: 'src/client.ts',
          content:
            'export async function go(id: string) {\n  // audithex-ignore-next-line\n\n  return fetch(`/api/${id}`);\n}\n',
        },
      ];
      writeTree(root, files);
      const ctx = makeContext(root, files, [sdkImportArtifact('src/sdk.ts')]);
      const findings = regexInCodeEngine.evaluate(makeFetchRule({ requiresAiContext: true }), ctx);
      expect(findings).toHaveLength(0);
    });

    it('rule-specific audithex-ignore only suppresses listed rule ids', () => {
      const files: TestFile[] = [
        { rel: 'package.json', content: '{"name":"app"}' },
        { rel: 'src/sdk.ts', content: "import O from 'openai';\n" },
        {
          rel: 'src/client.ts',
          content:
            'export async function go(id: string) {\n  return fetch(`/api/${id}`); // audithex-ignore: R010\n}\n',
        },
      ];
      writeTree(root, files);
      const ctx = makeContext(root, files, [sdkImportArtifact('src/sdk.ts')]);

      const r008 = regexInCodeEngine.evaluate(makeFetchRule({ requiresAiContext: true }), ctx);
      expect(r008).toHaveLength(1);

      const suppressed = regexInCodeEngine.evaluate(
        { ...makeFetchRule({ requiresAiContext: true }), _id: 'R010' },
        ctx,
      );
      expect(suppressed).toHaveLength(0);
    });
  });
});
