import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DiscoveryResult } from '@audithex/core-types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ruleR001 } from './R001-api-key-literal.js';

let root: string;

function buildDiscovery(): DiscoveryResult {
  return {
    rootPath: root,
    scannedAt: new Date().toISOString(),
    summary: {
      totalFiles: 0,
      byExtension: {},
      envFiles: 0,
      skippedByGitignore: 0,
      elapsedMs: 0,
    },
    artifacts: [],
  };
}

describe('ruleR001 — API key literal in source', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'audithex-r001-'));
    mkdirSync(join(root, 'src'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('flags a real OpenAI key shape in TypeScript source', () => {
    writeFileSync(
      join(root, 'src', 'agent.ts'),
      'const KEY = "sk-AbcdefghijklmnopqrstuvwxyzABCDEFGH";\n',
    );
    const findings = ruleR001.check(buildDiscovery());
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'R001',
      severity: 'critical',
      owasp: ['LLM06'],
      cwe: 'CWE-798',
    });
  });

  it('flags an Anthropic key shape', () => {
    writeFileSync(
      join(root, 'src', 'agent.ts'),
      'const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345-ABCDEFG";\n',
    );
    const findings = ruleR001.check(buildDiscovery());
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]?.messageParams?.provider).toBe('anthropic');
  });

  it('does not flag a key inside a // comment', () => {
    writeFileSync(
      join(root, 'src', 'agent.ts'),
      '// example sk-AbcdefghijklmnopqrstuvwxyzABCDEFGH\n',
    );
    const findings = ruleR001.check(buildDiscovery());
    expect(findings).toHaveLength(0);
  });

  it('returns zero findings for a clean file', () => {
    writeFileSync(join(root, 'src', 'agent.ts'), 'const url = process.env.OPENAI_BASE_URL;\n');
    expect(ruleR001.check(buildDiscovery())).toHaveLength(0);
  });
});
