import Link from 'next/link';
import type { ReactElement } from 'react';
import type { ScanDiff } from '../lib/diff';
import { formatTimestamp } from '../lib/format';
import type { ScanRunDetail, SerializableFinding } from '../lib/queries';
import SeverityBadge from './severity-badge';

interface Props {
  baseline: ScanRunDetail;
  candidate: ScanRunDetail;
  diff: ScanDiff;
  sessionEmail: string;
}

export default function ScanComparePage({
  baseline,
  candidate,
  diff,
  sessionEmail,
}: Props): ReactElement {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="border-b border-[#1f242d] pb-4">
        <Link
          href={`/scans/${candidate.id}`}
          data-testid="back-link"
          className="text-xs text-[#6b7280] hover:text-[#10b981]"
        >
          ← Scan {candidate.id.slice(0, 8)}…
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-[#10b981]" data-testid="compare-title">
          Compare two scans
        </h1>
        <p className="text-xs text-[#6b7280]">
          Signed in as <span data-testid="session-email">{sessionEmail}</span>.
        </p>
      </header>

      <section
        data-testid="compare-summary"
        className="grid grid-cols-1 gap-4 rounded-md border border-[#1f242d] bg-[#11141b] p-4 text-xs md:grid-cols-2"
      >
        <ScanCard label="Baseline (older)" run={baseline} testid="baseline-card" />
        <ScanCard label="Candidate (newer)" run={candidate} testid="candidate-card" />
      </section>

      <section
        data-testid="compare-totals"
        className="grid grid-cols-3 divide-x divide-[#1f242d] rounded-md border border-[#1f242d] bg-[#11141b] text-center"
      >
        <Total label="Added" value={diff.added.length} accent="#ef4444" testid="total-added" />
        <Total
          label="Removed"
          value={diff.removed.length}
          accent="#10b981"
          testid="total-removed"
        />
        <Total
          label="Unchanged"
          value={diff.unchanged.length}
          accent="#6b7280"
          testid="total-unchanged"
        />
      </section>

      <DiffGroup
        title="Added (new in candidate)"
        testid="group-added"
        findings={diff.added}
        emptyMessage="No new findings — the candidate scan introduced nothing the baseline did not already see."
        marker="+"
      />
      <DiffGroup
        title="Removed (gone in candidate)"
        testid="group-removed"
        findings={diff.removed}
        emptyMessage="No removed findings — the candidate scan kept every issue the baseline reported."
        marker="−"
      />
      <DiffGroup
        title="Unchanged"
        testid="group-unchanged"
        findings={diff.unchanged}
        emptyMessage="No overlap — the two scans share no findings."
        marker="="
      />
    </main>
  );
}

function ScanCard({
  label,
  run,
  testid,
}: {
  label: string;
  run: ScanRunDetail;
  testid: string;
}): ReactElement {
  return (
    <div data-testid={testid}>
      <p className="text-[10px] uppercase tracking-wide text-[#6b7280]">{label}</p>
      <Link
        href={`/scans/${run.id}`}
        className="mt-0.5 block font-mono text-sm text-[#10b981] hover:text-[#f97316]"
      >
        {run.id}
      </Link>
      <p className="mt-1 text-[#d4d4d4]">{formatTimestamp(run.scannedAt)}</p>
      <p className="text-[#6b7280]" title={run.rootPath}>
        {run.rootPath}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <SeverityBadge severity={run.topSeverity} />
        <span className="text-[#6b7280]">{run.totalFindings} findings</span>
      </div>
    </div>
  );
}

function Total({
  label,
  value,
  accent,
  testid,
}: {
  label: string;
  value: number;
  accent: string;
  testid: string;
}): ReactElement {
  return (
    <div className="px-4 py-4">
      <p className="text-[10px] uppercase tracking-wide text-[#6b7280]">{label}</p>
      <p
        data-testid={testid}
        className="mt-1 font-mono text-2xl font-semibold"
        style={{ color: accent }}
      >
        {value}
      </p>
    </div>
  );
}

function DiffGroup({
  title,
  testid,
  findings,
  emptyMessage,
  marker,
}: {
  title: string;
  testid: string;
  findings: SerializableFinding[];
  emptyMessage: string;
  marker: '+' | '−' | '=';
}): ReactElement {
  return (
    <section data-testid={testid} className="rounded-md border border-[#1f242d] bg-[#11141b]">
      <header className="flex items-center justify-between border-b border-[#1f242d] px-4 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#d4d4d4]">{title}</h2>
        <span data-testid={`${testid}-count`} className="text-xs text-[#6b7280]">
          {findings.length} finding{findings.length === 1 ? '' : 's'}
        </span>
      </header>
      {findings.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-[#6b7280]">{emptyMessage}</p>
      ) : (
        <ul className="divide-y divide-[#1f242d]">
          {findings.map((f, index) => (
            <li
              key={`${f.ruleId}-${f.file}-${f.line}-${index}`}
              data-testid="diff-row"
              data-rule-id={f.ruleId}
              data-direction={marker}
              className="px-4 py-3 text-xs"
            >
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-mono text-sm text-[#10b981]">
                  <span className="mr-1 text-[#6b7280]">{marker}</span>
                  {f.ruleId}
                </span>
                <SeverityBadge severity={f.severity} />
                <code className="text-[#d4d4d4]">
                  {f.file}:{f.line}
                </code>
              </div>
              <p className="mt-1 text-[11px] text-[#6b7280]">{f.messageKey}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
