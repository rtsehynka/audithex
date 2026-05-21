import Link from 'next/link';
import type { ReactElement } from 'react';
import { formatMs, formatTimestamp } from '../lib/format';
import type { ScanComparisonOption, ScanRunDetail, SerializableFinding } from '../lib/queries';
import ComparePicker from './compare-picker';
import FindingFixCard from './finding-fix-card';
import SeverityBadge from './severity-badge';

export interface CachedFix {
  findingKey: string;
  provider: string;
  model: string;
  costUsd: number;
  response: string;
}

interface Props {
  scan: ScanRunDetail;
  sessionEmail: string;
  compareOptions: ScanComparisonOption[];
  llmAvailable: boolean;
  llmProvider: 'anthropic' | 'openai' | 'gemini' | 'dry-run' | 'unconfigured';
  cachedFixes: CachedFix[];
}

const SEVERITY_ORDER: SerializableFinding['severity'][] = ['critical', 'high', 'medium', 'low'];

export default function ScanDetailPage({
  scan,
  sessionEmail,
  compareOptions,
  llmAvailable,
  llmProvider,
  cachedFixes,
}: Props): ReactElement {
  const grouped = groupBySeverity(scan.findings);
  const fixByKey = new Map<string, CachedFix>();
  for (const fix of cachedFixes) fixByKey.set(fix.findingKey, fix);
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[#1f242d] pb-4">
        <div>
          <Link
            href="/"
            data-testid="back-link"
            className="text-xs text-[#6b7280] hover:text-[#10b981]"
          >
            ← All scans
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-[#10b981]" data-testid="scan-title">
            Scan {scan.id}
          </h1>
          <p className="text-xs text-[#6b7280]">
            Signed in as <span data-testid="session-email">{sessionEmail}</span>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ComparePicker currentId={scan.id} options={compareOptions} />
          <Link
            href={`/scans/${scan.id}/pdf`}
            data-testid="download-pdf"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-[#1f242d] bg-[#11141b] px-3 py-1.5 text-xs text-[#d4d4d4] hover:border-[#10b981] hover:text-[#10b981]"
          >
            Download PDF
          </Link>
          <SeverityBadge severity={scan.topSeverity} />
        </div>
      </header>

      <section
        data-testid="scan-meta"
        className="grid grid-cols-1 gap-4 rounded-md border border-[#1f242d] bg-[#11141b] p-4 text-xs md:grid-cols-2"
      >
        <Meta label="Project root" value={scan.rootPath} testid="meta-root-path" />
        <Meta label="Scanned at" value={formatTimestamp(scan.scannedAt)} testid="meta-scanned-at" />
        <Meta label="Rules pack" value={scan.rulesVersion} testid="meta-rules-version" />
        <Meta label="Audithex" value={scan.audithexVersion} testid="meta-audithex-version" />
        <Meta label="Elapsed" value={formatMs(scan.elapsedMs)} testid="meta-elapsed" />
        <Meta
          label="Findings"
          value={`${scan.totalFindings} (${scan.severityCounts.critical} crit · ${scan.severityCounts.high} high · ${scan.severityCounts.medium} med · ${scan.severityCounts.low} low)`}
          testid="meta-findings"
        />
        <Meta
          label="Discovery"
          value={`${scan.discovery.totalFiles} files · ${scan.discovery.envFiles} env · ${scan.discovery.skippedByGitignore} gitignored`}
          testid="meta-discovery"
        />
        <Meta
          label="Fingerprint"
          value={shortFingerprint(scan.fingerprint)}
          testid="meta-fingerprint"
        />
      </section>

      {scan.findings.length === 0 ? (
        <p
          data-testid="no-findings"
          className="rounded-md border border-dashed border-[#1f242d] bg-[#11141b] px-6 py-10 text-center text-xs text-[#6b7280]"
        >
          This scan produced no findings — the project is clean against the loaded rules pack.
        </p>
      ) : (
        SEVERITY_ORDER.map((severity) => {
          const findings = grouped.get(severity);
          if (!findings || findings.length === 0) return null;
          return (
            <SeverityGroup
              key={severity}
              severity={severity}
              findings={findings}
              scanId={scan.id}
              llmAvailable={llmAvailable}
              llmProvider={llmProvider}
              fixByKey={fixByKey}
            />
          );
        })
      )}
    </main>
  );
}

function Meta({
  label,
  value,
  testid,
}: {
  label: string;
  value: string;
  testid: string;
}): ReactElement {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-[#6b7280]">{label}</p>
      <p data-testid={testid} className="mt-0.5 font-mono text-[#d4d4d4]" title={value}>
        {value}
      </p>
    </div>
  );
}

function SeverityGroup({
  severity,
  findings,
  scanId,
  llmAvailable,
  llmProvider,
  fixByKey,
}: {
  severity: SerializableFinding['severity'];
  findings: SerializableFinding[];
  scanId: string;
  llmAvailable: boolean;
  llmProvider: Props['llmProvider'];
  fixByKey: Map<string, CachedFix>;
}): ReactElement {
  return (
    <section
      data-testid={`severity-group-${severity}`}
      className="rounded-md border border-[#1f242d] bg-[#11141b]"
    >
      <header className="flex items-center justify-between border-b border-[#1f242d] px-4 py-2">
        <div className="flex items-center gap-2">
          <SeverityBadge severity={severity} />
          <span className="text-xs text-[#6b7280]">
            {findings.length} finding{findings.length === 1 ? '' : 's'}
          </span>
        </div>
      </header>
      <ul className="divide-y divide-[#1f242d]">
        {findings.map((f, index) => {
          const findingKey = `${f.ruleId}|${f.file}|${f.line}`;
          const cached = fixByKey.get(findingKey) ?? null;
          return (
            <li
              key={`${f.ruleId}-${f.file}-${f.line}-${index}`}
              data-testid="finding-row"
              data-rule-id={f.ruleId}
              className="px-4 py-3 text-xs"
            >
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-mono text-sm text-[#10b981]">{f.ruleId}</span>
                <span className="text-[#6b7280]">{f.owasp.join(', ') || '—'}</span>
                {f.cwe ? <span className="text-[#6b7280]">{f.cwe}</span> : null}
                <code className="text-[#d4d4d4]">
                  {f.file}:{f.line}
                  {typeof f.column === 'number' ? `:${f.column}` : ''}
                </code>
              </div>
              <p className="mt-1 text-[11px] text-[#6b7280]">
                <span className="font-semibold text-[#d4d4d4]">{f.messageKey}</span>
                {f.messageParams ? ` — ${formatParams(f.messageParams)}` : null}
              </p>
              <p className="mt-1 text-[11px] text-[#6b7280]">
                fix: <span className="text-[#d4d4d4]">{f.fixKey}</span>
              </p>
              {f.codeSnippet && f.codeSnippet.lines.length > 0 ? (
                <pre
                  data-testid="finding-snippet"
                  className="mt-2 overflow-x-auto rounded border border-[#1f242d] bg-[#0b0e14] p-2 font-mono text-[11px] leading-relaxed text-[#d4d4d4]"
                >
                  {f.codeSnippet.lines.map((line, i) => {
                    const lineNumber = (f.codeSnippet?.startLine ?? 1) + i;
                    const isFocus = lineNumber === f.codeSnippet?.focusLine;
                    return (
                      <div
                        key={`${f.file}-${lineNumber}`}
                        className={isFocus ? 'bg-[rgba(239,68,68,0.10)]' : undefined}
                      >
                        <span className="mr-3 inline-block w-10 select-none text-right text-[#6b7280]">
                          {lineNumber}
                        </span>
                        <span className={isFocus ? 'text-[#fecaca]' : undefined}>
                          {line.length === 0 ? ' ' : line}
                        </span>
                      </div>
                    );
                  })}
                </pre>
              ) : null}
              <FindingFixCard
                scanId={scanId}
                findingKey={findingKey}
                llmAvailable={llmAvailable}
                llmProvider={llmProvider}
                initialFix={cached}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function groupBySeverity(
  findings: SerializableFinding[],
): Map<SerializableFinding['severity'], SerializableFinding[]> {
  const out = new Map<SerializableFinding['severity'], SerializableFinding[]>();
  for (const f of findings) {
    const list = out.get(f.severity);
    if (list) list.push(f);
    else out.set(f.severity, [f]);
  }
  return out;
}

function formatParams(params: Record<string, string | number>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
}

function shortFingerprint(hex: string): string {
  if (hex.length <= 12) return hex;
  return `${hex.slice(0, 8)}…${hex.slice(-4)}`;
}
