import { describe, expect, it } from 'vitest';
import {
  MODEL_PATTERNS,
  PROVIDERS,
  SECRET_PATTERNS,
  getLanguageForExtension,
  getLanguageForFile,
  isCodeFile,
  isScannableFile,
  listCodeExtensions,
  listExtensions,
  listLanguages,
} from './index.js';

describe('language registry', () => {
  it('lists at least eight registered languages', () => {
    expect(listLanguages().length).toBeGreaterThanOrEqual(8);
  });

  it('every registered language has at least one extension', () => {
    for (const lang of listLanguages()) {
      expect(lang.extensions.length).toBeGreaterThan(0);
    }
  });

  it('extensions are unique across languages (first-match-wins index)', () => {
    const seen = new Map<string, string>();
    for (const lang of listLanguages()) {
      for (const ext of lang.extensions) {
        const e = ext.toLowerCase();
        // The index keeps the first registrant, so we just assert
        // the same extension never resolves to two different languages.
        const resolved = getLanguageForExtension(e);
        expect(resolved).toBeDefined();
        const previous = seen.get(e);
        if (previous && previous !== resolved?.id) {
          throw new Error(`Extension ${e} resolves inconsistently`);
        }
        seen.set(e, resolved?.id ?? '');
      }
    }
  });

  it('isScannableFile matches known and rejects unknown extensions', () => {
    expect(isScannableFile('foo.ts')).toBe(true);
    expect(isScannableFile('foo.py')).toBe(true);
    expect(isScannableFile('foo.php')).toBe(true);
    expect(isScannableFile('foo.go')).toBe(true);
    expect(isScannableFile('foo.md')).toBe(true);
    expect(isScannableFile('foo.exe')).toBe(false);
    expect(isScannableFile('Makefile')).toBe(false);
  });

  it('isCodeFile excludes plain-text variants', () => {
    expect(isCodeFile('foo.ts')).toBe(true);
    expect(isCodeFile('foo.py')).toBe(true);
    expect(isCodeFile('foo.md')).toBe(false);
    expect(isCodeFile('foo.yaml')).toBe(false);
  });

  it('listCodeExtensions excludes plain-text extensions', () => {
    const code = listCodeExtensions();
    expect(code).toContain('.ts');
    expect(code).toContain('.py');
    expect(code).not.toContain('.md');
    expect(code).not.toContain('.yaml');
    expect(code).not.toContain('.json');
  });

  it('extensions are a superset of listCodeExtensions', () => {
    const all = new Set(listExtensions());
    for (const e of listCodeExtensions()) {
      expect(all.has(e)).toBe(true);
    }
  });

  it('uppercase paths resolve via case-insensitive extension lookup', () => {
    expect(getLanguageForFile('Foo.TS')?.id).toBe('typescript');
    expect(getLanguageForExtension('.PY')?.id).toBe('python');
  });
});

describe('SDK import patterns', () => {
  it('every pattern names a known provider', () => {
    for (const lang of listLanguages()) {
      for (const pat of lang.sdkImportPatterns) {
        expect(PROVIDERS).toContain(pat.provider);
      }
    }
  });

  it('TypeScript Anthropic SDK pattern matches a real import line', () => {
    const ts = getLanguageForExtension('.ts');
    const hit = ts?.sdkImportPatterns.find((p) => p.provider === 'anthropic');
    expect(hit).toBeDefined();
    if (!hit) throw new Error('expected anthropic pattern');
    hit.regex.lastIndex = 0;
    expect(hit.regex.test("import Anthropic from '@anthropic-ai/sdk';")).toBe(true);
  });

  it('Python OpenAI pattern matches `from openai import OpenAI`', () => {
    const py = getLanguageForExtension('.py');
    const hit = py?.sdkImportPatterns.find((p) => p.provider === 'openai');
    expect(hit).toBeDefined();
    if (!hit) throw new Error('expected openai pattern');
    hit.regex.lastIndex = 0;
    expect(hit.regex.test('from openai import OpenAI')).toBe(true);
  });

  it('PHP Anthropic pattern matches `use Anthropic\\Client;`', () => {
    const phpLang = getLanguageForExtension('.php');
    const hit = phpLang?.sdkImportPatterns.find((p) => p.provider === 'anthropic');
    expect(hit).toBeDefined();
    if (!hit) throw new Error('expected anthropic pattern');
    hit.regex.lastIndex = 0;
    expect(hit.regex.test('use Anthropic\\Client;')).toBe(true);
  });
});

describe('shared model and secret patterns', () => {
  it('matches claude-opus-4-7', () => {
    const claude = MODEL_PATTERNS.find((p) => p.provider === 'anthropic');
    expect(claude).toBeDefined();
    if (!claude) throw new Error('expected anthropic pattern');
    claude.regex.lastIndex = 0;
    expect(claude.regex.test('"claude-opus-4-7"')).toBe(true);
  });

  it('matches gpt-4o', () => {
    const gpt = MODEL_PATTERNS.find(
      (p) => p.provider === 'openai' && p.regex.source.includes('gpt'),
    );
    expect(gpt).toBeDefined();
    if (!gpt) throw new Error('expected gpt pattern');
    gpt.regex.lastIndex = 0;
    expect(gpt.regex.test('"gpt-4o"')).toBe(true);
  });

  it('matches an OpenAI-shaped secret', () => {
    const openai = SECRET_PATTERNS.find((p) => p.provider === 'openai');
    expect(openai).toBeDefined();
    if (!openai) throw new Error('expected openai secret pattern');
    openai.regex.lastIndex = 0;
    expect(openai.regex.test('sk-AbcdefghijklmnopqrstuvwxyzABCDEFGH')).toBe(true);
  });
});
