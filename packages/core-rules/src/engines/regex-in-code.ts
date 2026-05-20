import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getLanguageForFile } from '@audithex/core-languages';
import type { Finding, RuleDocument } from '@audithex/core-types';
import type { EngineContext, RuleEngine } from './types.js';
import { patternMatchesTagWhitelist, safeCompileRegex } from './utils.js';

interface RegexInCodeParams {
  patternBundleId?: string;
  patternTagWhitelist?: string[];
  inlinePatterns?: InlinePattern[];
  languages?: string[];
  skipComments?: boolean;
  perFileLimit?: number;
}

interface InlinePattern {
  id: string;
  regex: string;
  languages?: string[];
  messageParamKind?: string;
}

const PER_FILE_DEFAULT_LIMIT = 200;

/**
 * Engine that scans each code file in the discovery result against a
 * set of regex patterns. Patterns come from either a referenced
 * pattern bundle (preferred — shareable) or `inlinePatterns` (rule-local).
 * The pattern source decides which `messageParams` reach the i18n
 * translator so the rendered finding stays informative.
 */
export const regexInCodeEngine: RuleEngine = {
  kind: 'regex-in-code',
  evaluate(rule: RuleDocument, ctx: EngineContext): Finding[] {
    const params = rule.params as unknown as RegexInCodeParams;
    const compiled = compilePatterns(rule, params, ctx);
    if (compiled.length === 0) return [];

    const allowedLanguages = new Set(params.languages ?? rule.languages ?? []);
    const skipComments = params.skipComments !== false;
    const perFileLimit = params.perFileLimit ?? PER_FILE_DEFAULT_LIMIT;
    const findings: Finding[] = [];

    for (const rel of ctx.discovery.files) {
      const language = getLanguageForFile(rel);
      if (!language || !language.capabilities.scansAsCode) continue;
      if (allowedLanguages.size > 0 && !allowedLanguages.has(language.id)) continue;

      let content: string;
      try {
        content = readFileSync(join(ctx.discovery.rootPath, rel), 'utf8');
      } catch {
        continue;
      }
      const lines = content.split(/\r?\n/);
      const commentPrefixes = language.lineCommentPrefixes;
      let perFile = 0;

      for (const pattern of compiled) {
        if (pattern.languages && !pattern.languages.has(language.id)) continue;
        for (let i = 0; i < lines.length; i += 1) {
          if (perFile >= perFileLimit) break;
          const line = lines[i] ?? '';
          if (skipComments && isCommentLine(line, commentPrefixes)) continue;
          pattern.regex.lastIndex = 0;
          for (const match of line.matchAll(pattern.regex)) {
            const column = (match.index ?? 0) + 1;
            findings.push({
              ruleId: rule._id,
              severity: rule.severity,
              owasp: rule.owasp,
              ...(rule.cwe ? { cwe: rule.cwe } : {}),
              location: {
                file: rel,
                line: i + 1,
                column,
                endLine: i + 1,
                endColumn: column + match[0].length,
              },
              messageKey: rule.messageKey,
              messageParams: pattern.messageParams,
              fixKey: rule.fixKey,
            });
            perFile += 1;
          }
        }
      }
    }

    return findings;
  },
};

interface CompiledPattern {
  regex: RegExp;
  messageParams: Record<string, string | number>;
  languages?: Set<string>;
}

function compilePatterns(
  rule: RuleDocument,
  params: RegexInCodeParams,
  ctx: EngineContext,
): CompiledPattern[] {
  const out: CompiledPattern[] = [];

  if (params.patternBundleId) {
    const bundle = ctx.patternBundles.get(params.patternBundleId);
    if (bundle) {
      const whitelist = params.patternTagWhitelist;
      for (const entry of bundle.entries) {
        if (!patternMatchesTagWhitelist(entry, whitelist)) continue;
        const compiled = safeCompileRegex(entry.regex);
        if (!compiled) continue;
        out.push({
          regex: compiled,
          messageParams: {
            provider: entry.provider,
            patternId: entry.id,
          },
        });
      }
    }
  }

  if (params.inlinePatterns) {
    for (const inline of params.inlinePatterns) {
      const compiled = safeCompileRegex(inline.regex);
      if (!compiled) continue;
      const item: CompiledPattern = {
        regex: compiled,
        messageParams: {
          patternId: inline.id,
          ...(inline.messageParamKind ? { messageParamKind: inline.messageParamKind } : {}),
        },
      };
      if (inline.languages) item.languages = new Set(inline.languages);
      out.push(item);
    }
  }

  // Rule-level language filter applies to every compiled pattern that
  // does not already pin its own language list.
  if (rule.languages && rule.languages.length > 0) {
    const ruleLangs = new Set(rule.languages);
    for (const compiled of out) {
      if (!compiled.languages) compiled.languages = ruleLangs;
    }
  }

  return out;
}

function isCommentLine(line: string, prefixes: readonly string[]): boolean {
  const trimmed = line.trimStart();
  for (const prefix of prefixes) {
    if (trimmed.startsWith(prefix)) return true;
  }
  return false;
}
