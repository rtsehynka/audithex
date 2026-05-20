import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Finding, RuleDocument, SecretPatternEntry } from '@audithex/core-types';
import type { EngineContext, RuleEngine } from './types.js';

interface RegexInPromptParams {
  patternBundleId?: string;
  patternTagWhitelist?: string[];
}

/**
 * Walks the system-prompt artifacts the discovery layer produced and
 * checks each prompt body against a regex pattern bundle. Used for
 * rules that need to look INSIDE the prompt (e.g. credentials in
 * standalone prompt files), without re-scanning every source file.
 */
export const regexInPromptEngine: RuleEngine = {
  kind: 'regex-in-prompt',
  evaluate(rule: RuleDocument, ctx: EngineContext): Finding[] {
    const params = rule.params as unknown as RegexInPromptParams;
    if (!params.patternBundleId) return [];
    const bundle = ctx.patternBundles.get(params.patternBundleId);
    if (!bundle) return [];
    const whitelist = params.patternTagWhitelist;
    const compiled = compileBundle(bundle.entries, whitelist);
    if (compiled.length === 0) return [];

    const findings: Finding[] = [];
    for (const artifact of ctx.discovery.artifacts) {
      if (artifact.kind !== 'system-prompt') continue;
      const promptText = loadPromptText(ctx.discovery.rootPath, artifact.location.file);
      if (promptText === null) continue;

      for (const pat of compiled) {
        pat.regex.lastIndex = 0;
        for (const match of promptText.matchAll(pat.regex)) {
          findings.push({
            ruleId: rule._id,
            severity: rule.severity,
            owasp: rule.owasp,
            ...(rule.cwe ? { cwe: rule.cwe } : {}),
            location: {
              file: artifact.location.file,
              line: artifact.location.line,
              ...(artifact.location.column ? { column: artifact.location.column } : {}),
            },
            messageKey: rule.messageKey,
            messageParams: {
              provider: pat.provider,
              patternId: pat.id,
            },
            fixKey: rule.fixKey,
          });
          if (pat.regex.lastIndex === (match.index ?? 0)) pat.regex.lastIndex += 1;
        }
      }
    }
    return findings;
  },
};

interface CompiledBundlePattern {
  id: string;
  provider: string;
  regex: RegExp;
}

function compileBundle(
  entries: readonly SecretPatternEntry[],
  whitelist: string[] | undefined,
): CompiledBundlePattern[] {
  const out: CompiledBundlePattern[] = [];
  for (const entry of entries) {
    if (!matchesTags(entry, whitelist)) continue;
    try {
      out.push({
        id: entry.id,
        provider: entry.provider,
        regex: new RegExp(entry.regex, 'g'),
      });
    } catch {
      // skip malformed pattern
    }
  }
  return out;
}

function matchesTags(entry: SecretPatternEntry, whitelist?: string[]): boolean {
  if (!whitelist || whitelist.length === 0) return true;
  if (!entry.tags || entry.tags.length === 0) return false;
  for (const tag of entry.tags) {
    if (whitelist.includes(tag)) return true;
  }
  return false;
}

function loadPromptText(rootPath: string, relFile: string): string | null {
  try {
    return readFileSync(join(rootPath, relFile), 'utf8');
  } catch {
    return null;
  }
}
