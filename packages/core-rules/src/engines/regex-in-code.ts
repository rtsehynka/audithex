import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
  /**
   * Gate the rule to packages that contain at least one `sdk-import`
   * artifact. A "package" is the nearest `package.json` ancestor; files
   * with no package.json above them share the project root as a single
   * implicit package. Lets LLM05-style rules (SSRF/XSS/eval/exec/SQL)
   * fire only in code that actually touches an LLM SDK, so generic
   * web vulnerabilities in unrelated packages do not produce findings.
   */
  requiresAiContext?: boolean;
}

interface InlinePattern {
  id: string;
  regex: string;
  languages?: string[];
  messageParamKind?: string;
  /**
   * Run this regex against the WHOLE file content rather than each
   * line in isolation. Needed for patterns that span multiple lines
   * (e.g. `anthropic.messages.create({\n  model: …\n})` with a
   * negative-lookahead for `max_tokens`).
   */
  multiline?: boolean;
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

    let fileToPackageRoot: Map<string, string> | null = null;
    const aiContextPackages = new Set<string>();
    if (params.requiresAiContext) {
      fileToPackageRoot = computeFileToPackageRoot(ctx.discovery.files, ctx.discovery.rootPath);
      for (const artifact of ctx.discovery.artifacts) {
        if (artifact.kind !== 'sdk-import' && artifact.kind !== 'llm-call-site') continue;
        const root = fileToPackageRoot.get(artifact.location.file);
        if (root !== undefined) aiContextPackages.add(root);
      }
    }

    for (const rel of ctx.discovery.files) {
      const language = getLanguageForFile(rel);
      if (!language) continue;
      // Plain-text files are normally skipped (scansAsCode: false), but
      // a rule that explicitly lists `plain-text` in its languages
      // (e.g. R014 against package.json / requirements.txt) opts in.
      const optedInToNonCode = allowedLanguages.size > 0 && allowedLanguages.has(language.id);
      if (!language.capabilities.scansAsCode && !optedInToNonCode) continue;
      if (allowedLanguages.size > 0 && !allowedLanguages.has(language.id)) continue;

      if (params.requiresAiContext && fileToPackageRoot) {
        const pkg = fileToPackageRoot.get(rel);
        if (pkg === undefined || !aiContextPackages.has(pkg)) continue;
      }

      let content: string;
      try {
        content = readFileSync(join(ctx.discovery.rootPath, rel), 'utf8');
      } catch {
        continue;
      }
      const lines = content.split(/\r?\n/);
      const commentPrefixes = language.lineCommentPrefixes;
      const suppressions = parseSuppressions(lines);
      let perFile = 0;

      for (const pattern of compiled) {
        if (pattern.languages && !pattern.languages.has(language.id)) continue;
        if (pattern.multiline) {
          // Match the regex against the full file content so multi-line
          // shapes work (e.g. `anthropic.messages.create({\n  model:…\n})`).
          // Recover the 1-based line/column from the match offset.
          pattern.regex.lastIndex = 0;
          for (const match of content.matchAll(pattern.regex)) {
            if (perFile >= perFileLimit) break;
            const offset = match.index ?? 0;
            const { line, column } = offsetToLineColumn(content, offset);
            if (isSuppressed(suppressions, line, rule._id)) continue;
            findings.push({
              kind: 'static',
              ruleId: rule._id,
              severity: rule.severity,
              owasp: rule.owasp,
              ...(rule.cwe ? { cwe: rule.cwe } : {}),
              blockId: rule.block,
              location: {
                file: rel,
                line,
                column,
                endLine: line,
                endColumn: column + match[0].length,
              },
              messageKey: rule.messageKey,
              messageParams: pattern.messageParams,
              rationaleKey: rule.rationaleKey,
              fixKey: rule.fixKey,
            });
            perFile += 1;
          }
          continue;
        }
        for (let i = 0; i < lines.length; i += 1) {
          if (perFile >= perFileLimit) break;
          const line = lines[i] ?? '';
          if (skipComments && isCommentLine(line, commentPrefixes)) continue;
          if (isSuppressed(suppressions, i + 1, rule._id)) continue;
          pattern.regex.lastIndex = 0;
          for (const match of line.matchAll(pattern.regex)) {
            const column = (match.index ?? 0) + 1;
            findings.push({
              kind: 'static',
              ruleId: rule._id,
              severity: rule.severity,
              owasp: rule.owasp,
              ...(rule.cwe ? { cwe: rule.cwe } : {}),
              blockId: rule.block,
              location: {
                file: rel,
                line: i + 1,
                column,
                endLine: i + 1,
                endColumn: column + match[0].length,
              },
              messageKey: rule.messageKey,
              messageParams: pattern.messageParams,
              rationaleKey: rule.rationaleKey,
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
  multiline?: boolean;
}

function offsetToLineColumn(content: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < offset && i < content.length; i += 1) {
    if (content.charCodeAt(i) === 10) {
      line += 1;
      lastNewline = i;
    }
  }
  return { line, column: offset - lastNewline };
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
      if (inline.multiline) item.multiline = true;
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

/**
 * Compute the nearest `package.json` ancestor for every scanned file.
 * The path is relative to `rootPath` and `''` means "scan root with no
 * package.json above it" — those files share an implicit single package.
 * Dir-level cache keeps the fs-stat count linear in unique directories.
 */
function computeFileToPackageRoot(files: readonly string[], rootPath: string): Map<string, string> {
  const dirCache = new Map<string, string>();
  const out = new Map<string, string>();

  const resolveForDir = (relDir: string): string => {
    const cached = dirCache.get(relDir);
    if (cached !== undefined) return cached;
    let current = relDir;
    while (true) {
      const absDir = current === '' ? rootPath : join(rootPath, current);
      if (existsSync(join(absDir, 'package.json'))) {
        dirCache.set(relDir, current);
        return current;
      }
      if (current === '' || current === '.') break;
      const parent = dirname(current);
      current = parent === '.' ? '' : parent;
    }
    dirCache.set(relDir, '');
    return '';
  };

  for (const rel of files) {
    const relDir = dirname(rel);
    out.set(rel, resolveForDir(relDir === '.' ? '' : relDir));
  }
  return out;
}

/**
 * Map of 1-based line number → set of suppressed rule ids. The literal
 * `'*'` in the set means "suppress every rule on this line". Three
 * pragmas are recognised, language-agnostic (only the keyword has to
 * appear inside a comment):
 *
 *   audithex-ignore-line              — current line, all rules
 *   audithex-ignore-next-line         — next non-blank line, all rules
 *   audithex-ignore: R008, R010       — current line, named rules only
 */
type SuppressionMap = Map<number, Set<string>>;

const PRAGMA_RULES_RE = /audithex-ignore:\s*([A-Za-z0-9_,\s]+?)(?:\*\/|$|\s{2,})/;
const PRAGMA_NEXT_RE = /\baudithex-ignore-next-line\b/;
const PRAGMA_LINE_RE = /\baudithex-ignore-line\b/;

function parseSuppressions(lines: readonly string[]): SuppressionMap {
  const map: SuppressionMap = new Map();
  const addAt = (lineNum: number, ids: Iterable<string>) => {
    const existing = map.get(lineNum);
    if (existing) {
      for (const id of ids) existing.add(id);
    } else {
      map.set(lineNum, new Set(ids));
    }
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    // Rule-specific match wins over the catch-all on the same line.
    const ruleMatch = PRAGMA_RULES_RE.exec(line);
    if (ruleMatch?.[1]) {
      const ids = ruleMatch[1]
        .split(/[,\s]+/)
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      if (ids.length > 0) {
        addAt(i + 1, ids);
        continue;
      }
    }
    if (PRAGMA_NEXT_RE.test(line)) {
      for (let j = i + 1; j < lines.length; j += 1) {
        if ((lines[j] ?? '').trim() !== '') {
          addAt(j + 1, ['*']);
          break;
        }
      }
      continue;
    }
    if (PRAGMA_LINE_RE.test(line)) {
      addAt(i + 1, ['*']);
    }
  }
  return map;
}

function isSuppressed(map: SuppressionMap, line: number, ruleId: string): boolean {
  const entry = map.get(line);
  if (!entry) return false;
  return entry.has('*') || entry.has(ruleId);
}
