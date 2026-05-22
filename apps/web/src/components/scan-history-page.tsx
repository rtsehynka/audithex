import Link from 'next/link';
import type { ReactElement } from 'react';
import { compactPath, formatMs, formatTimestamp, shortId } from '../lib/format';
import type { ListScansResult } from '../lib/queries';
import AppShell from './app-shell';
import PageHeader from './page-header';
import SeverityBadge from './severity-badge';
import { Td, Th } from './table-cells';

interface Props {
  data: ListScansResult;
  sessionEmail: string;
}

export default function ScanHistoryPage({ data, sessionEmail }: Props): ReactElement {
  return (
    <AppShell sessionEmail={sessionEmail} active="scans">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <PageHeader
          title="Scans"
          subtitle={
            <>
              {data.total} run{data.total === 1 ? '' : 's'} on record. Each row links to the full
              report.
            </>
          }
        />
        {data.runs.length === 0 ? <EmptyState /> : <ScanTable data={data} />}
      </div>
    </AppShell>
  );
}

function EmptyState(): ReactElement {
  return (
    <section
      data-testid="empty-state"
      className="rounded-md border border-dashed border-[#1f242d] bg-[#11141b] px-6 py-10 text-center"
    >
      <h2 className="text-base font-semibold text-[#d4d4d4]">No scans recorded yet</h2>
      <p className="mt-2 text-xs text-[#6b7280]">
        Create a project from <strong className="text-[#10b981]">Projects → New project</strong> and
        click <strong className="text-[#10b981]">Run scan</strong>, or run{' '}
        <code className="rounded bg-[#0b0e14] px-1 py-0.5 text-[#10b981]">
          audithex scan ./your-project
        </code>{' '}
        from the CLI — every persisted run shows up here.
      </p>
    </section>
  );
}

function ScanTable({ data }: { data: ListScansResult }): ReactElement {
  return (
    <section
      data-testid="scan-table"
      className="overflow-x-auto rounded-md border border-[#1f242d] bg-[#11141b]"
    >
      <table className="min-w-full divide-y divide-[#1f242d] text-sm">
        <thead className="bg-[#0e1119] text-[#6b7280]">
          <tr>
            <Th>Id</Th>
            <Th>Project</Th>
            <Th>Scanned at</Th>
            <Th>Top severity</Th>
            <Th>Findings</Th>
            <Th>Rules</Th>
            <Th>Elapsed</Th>
            <Th>Path</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1f242d]">
          {data.runs.map((run) => {
            const { critical, high, medium, low } = run.severityCounts;
            return (
              <tr
                key={run.id}
                data-testid="scan-row"
                data-scan-id={run.id}
                className="hover:bg-[rgba(16,185,129,0.04)]"
              >
                <Td>
                  <Link
                    href={`/scans/${run.id}`}
                    data-testid="scan-link"
                    className="font-mono text-[#10b981] hover:text-[#f97316]"
                  >
                    {shortId(run.id)}
                  </Link>
                </Td>
                <Td data-testid="scan-project">
                  {run.projectId && run.projectName ? (
                    <Link
                      href={`/projects/${run.projectId}`}
                      className="text-[#10b981] hover:text-[#f97316]"
                    >
                      {run.projectName}
                    </Link>
                  ) : (
                    <span className="text-[#6b7280]">—</span>
                  )}
                </Td>
                <Td>{formatTimestamp(run.scannedAt)}</Td>
                <Td>
                  <SeverityBadge severity={run.topSeverity} />
                </Td>
                <Td>
                  <span data-testid="severity-counts" className="text-[#d4d4d4]">
                    C{critical} H{high} M{medium} L{low}
                  </span>
                </Td>
                <Td className="text-[#6b7280]">{run.rulesVersion}</Td>
                <Td className="text-[#6b7280]">{formatMs(run.elapsedMs)}</Td>
                <Td className="text-[#d4d4d4]" title={run.rootPath}>
                  {compactPath(run.rootPath)}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <PaginationBar limit={data.limit} skip={data.skip} total={data.total} />
    </section>
  );
}

function PaginationBar({
  limit,
  skip,
  total,
}: {
  limit: number;
  skip: number;
  total: number;
}): ReactElement {
  const start = total === 0 ? 0 : skip + 1;
  const end = Math.min(skip + limit, total);
  const prev = Math.max(skip - limit, 0);
  const next = skip + limit < total ? skip + limit : null;
  return (
    <nav className="flex items-center justify-between border-t border-[#1f242d] px-3 py-2 text-xs text-[#6b7280]">
      <span data-testid="pagination-range">
        Showing {start} – {end} of {total}
      </span>
      <div className="flex gap-2">
        {skip > 0 ? (
          <Link
            href={`/?skip=${prev}&limit=${limit}`}
            data-testid="pagination-prev"
            className="rounded border border-[#1f242d] px-2 py-1 text-[#d4d4d4] hover:border-[#10b981] hover:text-[#10b981]"
          >
            ← Newer
          </Link>
        ) : null}
        {next !== null ? (
          <Link
            href={`/?skip=${next}&limit=${limit}`}
            data-testid="pagination-next"
            className="rounded border border-[#1f242d] px-2 py-1 text-[#d4d4d4] hover:border-[#10b981] hover:text-[#10b981]"
          >
            Older →
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
