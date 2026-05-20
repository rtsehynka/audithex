import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { DiscoveryResult, Finding, Rule } from '@audithex/core-types';

// Each pattern matches a published API-key prefix.
// Patterns are intentionally narrow to keep false positives near zero.
const KEY_PATTERNS: readonly { name: string; regex: RegExp }[] = [
  { name: 'openai', regex: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: 'anthropic', regex: /\bsk-ant-[A-Za-z0-9_-]{30,}\b/ },
  { name: 'google', regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const ALWAYS_IGNORE = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'out',
  '.turbo',
  'coverage',
]);

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return '';
  return path.slice(dot).toLowerCase();
}

function looksLikeComment(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function walkSources(root: string): string[] {
  const out: string[] = [];
  const stack: string[] = ['.'];
  while (stack.length > 0) {
    const rel = stack.pop();
    if (rel === undefined) break;
    const absolute = rel === '.' ? root : join(root, rel);
    let entries: string[];
    try {
      entries = readdirSync(absolute);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (ALWAYS_IGNORE.has(entry)) continue;
      const childRel = rel === '.' ? entry : `${rel}/${entry}`;
      const childAbs = join(root, childRel);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(childAbs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(childRel);
      } else if (st.isFile() && SOURCE_EXTENSIONS.has(extensionOf(entry))) {
        out.push(childRel);
      }
    }
  }
  return out;
}

export const ruleR001: Rule = {
  id: 'R001',
  severity: 'critical',
  owasp: ['LLM06'],
  cwe: 'CWE-798',
  check(discovery: DiscoveryResult): Finding[] {
    const findings: Finding[] = [];
    const files = walkSources(discovery.rootPath);

    for (const rel of files) {
      let content: string;
      try {
        content = readFileSync(join(discovery.rootPath, rel), 'utf8');
      } catch {
        continue;
      }
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        if (looksLikeComment(line)) return;
        for (const pattern of KEY_PATTERNS) {
          const match = pattern.regex.exec(line);
          if (!match) continue;
          findings.push({
            ruleId: 'R001',
            severity: 'critical',
            owasp: ['LLM06'],
            cwe: 'CWE-798',
            location: {
              file: rel,
              line: idx + 1,
              column: match.index + 1,
              endLine: idx + 1,
              endColumn: match.index + 1 + match[0].length,
            },
            messageKey: 'findings:R001.message',
            messageParams: { provider: pattern.name },
            fixKey: 'findings:R001.fix',
          });
        }
      });
    }

    return findings;
  },
};
