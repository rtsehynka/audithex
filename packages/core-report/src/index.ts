import { t } from '@audithex/core-i18n';
import type { Finding, ScanResult, Severity } from '@audithex/core-types';

export type ReportFormat = 'console' | 'json' | 'md';

const SEVERITY_ORDER: readonly Severity[] = ['critical', 'high', 'medium', 'low'];

function countBySeverity(findings: readonly Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    counts[f.severity] += 1;
  }
  return counts;
}

export function renderConsole(result: ScanResult): string {
  const lines: string[] = [];
  lines.push(`${t('common:app.name')} — ${t('common:app.tagline')}`);
  lines.push('');
  lines.push(t('scan:summary.title'));
  lines.push(`  ${t('scan:summary.totalFiles', { count: result.discovery.totalFiles })}`);
  for (const [ext, count] of Object.entries(result.discovery.byExtension).sort()) {
    lines.push(`    ${ext}  ${count}`);
  }
  lines.push(`  ${t('scan:summary.envFiles', { count: result.discovery.envFiles })}`);
  lines.push(`  ${t('scan:summary.skipped', { count: result.discovery.skippedByGitignore })}`);
  lines.push(`  ${t('scan:summary.elapsedMs', { ms: result.elapsedMs })}`);
  lines.push('');

  if (result.findings.length === 0) {
    lines.push(t('scan:noFindings'));
    return lines.join('\n');
  }

  const counts = countBySeverity(result.findings);
  lines.push(t('findings:category.title'));
  for (const sev of SEVERITY_ORDER) {
    if (counts[sev] === 0) continue;
    lines.push(`  ${t(`findings:severity.${sev}`)}: ${counts[sev]}`);
  }
  lines.push('');
  for (const sev of SEVERITY_ORDER) {
    const group = result.findings.filter((f) => f.severity === sev);
    if (group.length === 0) continue;
    lines.push(`[${t(`findings:severity.${sev}`)}]`);
    for (const f of group) {
      const owasp = f.owasp.join(', ');
      const message = t(f.messageKey, f.messageParams);
      lines.push(`  ${f.ruleId}  ${owasp}  ${message}`);
      lines.push(`    ${f.location.file}:${f.location.line}`);
    }
    lines.push('');
  }
  lines.push(t('scan:completed'));
  return lines.join('\n');
}

export function renderJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

export function renderMarkdown(result: ScanResult): string {
  const lines: string[] = [];
  lines.push(`# ${t('common:app.name')} report`);
  lines.push('');
  lines.push(`- Scanned at: ${result.scannedAt}`);
  lines.push(`- Root: ${result.rootPath}`);
  lines.push(`- Rules version: ${result.rulesVersion}`);
  lines.push(`- Audithex version: ${result.audithexVersion}`);
  lines.push(`- Files: ${result.discovery.totalFiles}`);
  lines.push('');
  if (result.findings.length === 0) {
    lines.push(`> ${t('scan:noFindings')}`);
    return lines.join('\n');
  }
  for (const sev of SEVERITY_ORDER) {
    const group = result.findings.filter((f) => f.severity === sev);
    if (group.length === 0) continue;
    lines.push(`## ${t(`findings:severity.${sev}`)} (${group.length})`);
    lines.push('');
    for (const f of group) {
      lines.push(`### ${f.ruleId} — ${t(f.messageKey, f.messageParams)}`);
      lines.push(`- OWASP: ${f.owasp.join(', ')}`);
      if (f.cwe) lines.push(`- CWE: ${f.cwe}`);
      lines.push(`- Location: \`${f.location.file}:${f.location.line}\``);
      lines.push('');
      lines.push(`> ${t(f.fixKey, f.fixParams)}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

export function renderReport(format: ReportFormat, result: ScanResult): string {
  switch (format) {
    case 'console':
      return renderConsole(result);
    case 'json':
      return renderJson(result);
    case 'md':
      return renderMarkdown(result);
    default: {
      const exhaustive: never = format;
      throw new Error(`Unknown report format: ${exhaustive as string}`);
    }
  }
}
