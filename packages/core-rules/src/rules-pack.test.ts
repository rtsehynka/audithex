import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DiscoveryArtifact, DiscoveryResult } from '@audithex/core-types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBundledRulesPack, runRules } from './index.js';

let root: string;

function discoveryFor(
  files: readonly string[],
  artifacts: DiscoveryArtifact[] = [],
): DiscoveryResult {
  return {
    rootPath: root,
    scannedAt: new Date().toISOString(),
    summary: {
      totalFiles: files.length,
      byExtension: {},
      envFiles: 0,
      skippedByGitignore: 0,
      elapsedMs: 0,
    },
    files: [...files],
    artifacts,
  };
}

describe('rules-pack end-to-end across R001-R010', () => {
  const pack = loadBundledRulesPack();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'audithex-rp-'));
    mkdirSync(join(root, 'src'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('R001 fires on a hardcoded OpenAI key in a TypeScript file', () => {
    writeFileSync(
      join(root, 'src', 'agent.ts'),
      'const k = "sk-AbcdefghijklmnopqrstuvwxyzABCDEFGH";\n',
    );
    const findings = runRules(discoveryFor(['src/agent.ts']), {
      rulesPack: pack,
      ruleIds: ['R001'],
    });
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]?.ruleId).toBe('R001');
  });

  it('R002 fires on a key inside a system prompt artifact', () => {
    writeFileSync(
      join(root, 'system.md'),
      'You are a helpful assistant. Internal key: sk-AbcdefghijklmnopqrstuvwxyzABCDEFGH for debugging.\n',
    );
    const artifact: DiscoveryArtifact = {
      kind: 'system-prompt',
      confidence: 'regex',
      location: { file: 'system.md', line: 1 },
      detail: { origin: 'standalone-file', preview: 'You are', characterCount: 200 },
    };
    const findings = runRules(discoveryFor(['system.md'], [artifact]), {
      rulesPack: pack,
      ruleIds: ['R002'],
    });
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]?.ruleId).toBe('R002');
  });

  it('R003 fires on a tool-definition artifact with hasDescription=false', () => {
    const artifact: DiscoveryArtifact = {
      kind: 'tool-definition',
      confidence: 'regex',
      location: { file: 'tools.json', line: 3 },
      detail: { toolName: 'weak', framework: 'openai', hasDescription: false, hasSchema: true },
    };
    const findings = runRules(discoveryFor(['tools.json'], [artifact]), {
      rulesPack: pack,
      ruleIds: ['R003'],
    });
    expect(findings).toHaveLength(1);
  });

  it('R004 fires on a tool-definition artifact with hasSchema=false', () => {
    const artifact: DiscoveryArtifact = {
      kind: 'tool-definition',
      confidence: 'regex',
      location: { file: 'tools.json', line: 5 },
      detail: {
        toolName: 'no-schema',
        framework: 'anthropic',
        hasDescription: true,
        hasSchema: false,
      },
    };
    const findings = runRules(discoveryFor(['tools.json'], [artifact]), {
      rulesPack: pack,
      ruleIds: ['R004'],
    });
    expect(findings).toHaveLength(1);
  });

  // R005/R007/R009/R010 are LLM05 rules with `requiresAiContext: true` —
  // they fire only inside packages that contain at least one sdk-import
  // artifact. The test fixtures below add a package.json + an sdk-import
  // so the AI-context gate is satisfied.
  function aiContextArtifact(file: string): DiscoveryArtifact {
    return {
      kind: 'sdk-import',
      confidence: 'ast',
      location: { file, line: 1, column: 1 },
      detail: { provider: 'anthropic', importPath: '@anthropic-ai/sdk' },
    };
  }

  it('R005 fires on eval in TypeScript and exec in Python', () => {
    writeFileSync(join(root, 'package.json'), '{"name":"ai-app"}\n');
    writeFileSync(join(root, 'src', 'llm.ts'), "import Anthropic from '@anthropic-ai/sdk';\n");
    writeFileSync(join(root, 'src', 'a.ts'), 'eval("dangerous");\n');
    writeFileSync(join(root, 'a.py'), 'exec(payload)\n');
    const findings = runRules(
      discoveryFor(
        ['package.json', 'src/llm.ts', 'src/a.ts', 'a.py'],
        [aiContextArtifact('src/llm.ts')],
      ),
      { rulesPack: pack, ruleIds: ['R005'] },
    );
    expect(findings.length).toBeGreaterThanOrEqual(2);
  });

  it('R007 fires on PHP shell_exec with $variable', () => {
    writeFileSync(join(root, 'package.json'), '{"name":"ai-app"}\n');
    writeFileSync(join(root, 'src', 'llm.ts'), "import Anthropic from '@anthropic-ai/sdk';\n");
    writeFileSync(join(root, 'a.php'), '<?php\nshell_exec($cmd);\n');
    const findings = runRules(
      discoveryFor(['package.json', 'src/llm.ts', 'a.php'], [aiContextArtifact('src/llm.ts')]),
      { rulesPack: pack, ruleIds: ['R007'] },
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it('R009 fires on a SQL template literal interpolation in TS', () => {
    writeFileSync(join(root, 'package.json'), '{"name":"ai-app"}\n');
    writeFileSync(join(root, 'src', 'llm.ts'), "import Anthropic from '@anthropic-ai/sdk';\n");
    writeFileSync(join(root, 'src', 'q.ts'), 'const q = `SELECT * FROM users WHERE id = ${id}`;\n');
    const findings = runRules(
      discoveryFor(['package.json', 'src/llm.ts', 'src/q.ts'], [aiContextArtifact('src/llm.ts')]),
      { rulesPack: pack, ruleIds: ['R009'] },
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it('R010 fires on a React dangerouslySetInnerHTML', () => {
    writeFileSync(join(root, 'package.json'), '{"name":"ai-app"}\n');
    writeFileSync(join(root, 'src', 'llm.ts'), "import Anthropic from '@anthropic-ai/sdk';\n");
    writeFileSync(
      join(root, 'src', 'comp.tsx'),
      'export const C = ({ html }) => <div dangerouslySetInnerHTML={{ __html: html }} />;\n',
    );
    const findings = runRules(
      discoveryFor(
        ['package.json', 'src/llm.ts', 'src/comp.tsx'],
        [aiContextArtifact('src/llm.ts')],
      ),
      { rulesPack: pack, ruleIds: ['R010'] },
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it('disabled rule does not run', () => {
    const customPack = {
      ...pack,
      rules: pack.rules.map((r) => (r._id === 'R001' ? { ...r, enabled: false } : r)),
    };
    writeFileSync(
      join(root, 'src', 'agent.ts'),
      'const k = "sk-AbcdefghijklmnopqrstuvwxyzABCDEFGH";\n',
    );
    const findings = runRules(discoveryFor(['src/agent.ts']), {
      rulesPack: customPack,
      ruleIds: ['R001'],
    });
    expect(findings).toHaveLength(0);
  });

  it('clean file produces zero findings across all bundled rules', () => {
    writeFileSync(
      join(root, 'src', 'safe.ts'),
      'export function hi(name: string) { return `Hello ${name}`; }\n',
    );
    const findings = runRules(discoveryFor(['src/safe.ts']), { rulesPack: pack });
    expect(findings).toHaveLength(0);
  });
});
