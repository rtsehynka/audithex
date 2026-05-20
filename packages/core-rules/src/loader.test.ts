import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBundledRulesPack, loadRulesPack } from './loader.js';

describe('loadBundledRulesPack', () => {
  it('returns the bundled pack with all 10 starter rules', () => {
    const pack = loadBundledRulesPack();
    expect(pack.source).toBe('bundled');
    expect(pack.rules).toHaveLength(10);
    const ids = pack.rules.map((r) => r._id).sort();
    expect(ids).toEqual([
      'R001',
      'R002',
      'R003',
      'R004',
      'R005',
      'R006',
      'R007',
      'R008',
      'R009',
      'R010',
    ]);
  });

  it('loads the bundled secret-patterns bundle', () => {
    const pack = loadBundledRulesPack();
    const bundle = pack.patternBundles.find((b) => b._id === 'secrets-llm-providers-v1');
    expect(bundle).toBeDefined();
    expect(bundle?.entries.length).toBeGreaterThan(10);
  });
});

describe('loadRulesPack with user override', () => {
  let userDir: string;

  beforeEach(() => {
    userDir = mkdtempSync(join(tmpdir(), 'audithex-pack-'));
  });

  afterEach(() => {
    rmSync(userDir, { recursive: true, force: true });
  });

  it('falls back to bundled when user dir has no manifest', () => {
    const pack = loadRulesPack({ userRulesPackDir: userDir });
    expect(pack.source).toBe('bundled');
  });

  it('uses the user override when manifest is present', () => {
    mkdirSync(join(userDir, 'rules'), { recursive: true });
    mkdirSync(join(userDir, 'patterns'), { recursive: true });
    writeFileSync(
      join(userDir, 'manifest.json'),
      JSON.stringify({
        _id: 'audithex-rules-pack',
        schemaVersion: '0.1',
        version: '99.0.0',
        releasedAt: '2099-01-01T00:00:00Z',
        ruleIds: ['R001'],
        patternBundleIds: [],
      }),
    );
    writeFileSync(
      join(userDir, 'rules', 'R001.json'),
      JSON.stringify({
        _id: 'R001',
        schemaVersion: '0.1',
        severity: 'low',
        owasp: ['LLM06'],
        engine: 'regex-in-code',
        params: { inlinePatterns: [] },
        messageKey: 'm',
        fixKey: 'f',
      }),
    );

    const pack = loadRulesPack({ userRulesPackDir: userDir });
    expect(pack.source).toBe('user');
    expect(pack.manifest.version).toBe('99.0.0');
    expect(pack.rules).toHaveLength(1);
  });

  it('preferBundled overrides a present user pack', () => {
    writeFileSync(
      join(userDir, 'manifest.json'),
      JSON.stringify({
        _id: 'x',
        schemaVersion: '0.1',
        version: '99.0.0',
        releasedAt: '',
        ruleIds: [],
        patternBundleIds: [],
      }),
    );
    const pack = loadRulesPack({ userRulesPackDir: userDir, preferBundled: true });
    expect(pack.source).toBe('bundled');
  });
});
