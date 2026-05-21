import Link from 'next/link';
import type { ReactElement } from 'react';
import { deleteProjectAction, updateProjectAction } from '../app/projects/actions';
import { compactPath, formatMs, formatTimestamp, shortId } from '../lib/format';
import type { ProjectView } from '../lib/projects';
import type { ScanRunSummary } from '../lib/queries';
import type { RuleOption } from '../lib/rules';
import ProjectForm from './project-form';
import SeverityBadge from './severity-badge';

interface Props {
  project: ProjectView;
  scans: ScanRunSummary[];
  totalScans: number;
  sessionEmail: string;
  rules: RuleOption[];
}

export default function ProjectDetailPage({
  project,
  scans,
  totalScans,
  sessionEmail,
  rules,
}: Props): ReactElement {
  const bound = updateProjectAction.bind(null, project.id);
  const deleteBound = deleteProjectAction.bind(null, project.id);
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[#1f242d] pb-4">
        <div>
          <Link
            href="/projects"
            data-testid="back-link"
            className="text-xs text-[#6b7280] hover:text-[#10b981]"
          >
            ← All projects
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-[#10b981]" data-testid="project-title">
            {project.name}
          </h1>
          <p className="text-xs text-[#6b7280]">
            Signed in as <span data-testid="session-email">{sessionEmail}</span>. Root:{' '}
            <span className="font-mono text-[#d4d4d4]" data-testid="detail-root-path">
              {project.rootPath}
            </span>
          </p>
        </div>
        <form action={deleteBound}>
          <button
            type="submit"
            data-testid="delete-project"
            className="rounded-md border border-[#1f242d] bg-[#11141b] px-3 py-1.5 text-xs text-[#ef4444] hover:border-[#ef4444]"
          >
            Delete project
          </button>
        </form>
      </header>

      <section
        data-testid="edit-card"
        className="rounded-md border border-[#1f242d] bg-[#11141b] p-4"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#10b981]">Settings</h2>
        <p className="mt-1 text-[10px] text-[#6b7280]">
          Edits take effect on the next <code>audithex scan --project {project.name}</code> or web
          run. Scans already in the database keep their original severities.
        </p>
        <div className="mt-3">
          <ProjectForm initial={project} submitLabel="Save changes" action={bound} rules={rules} />
        </div>
      </section>

      <section
        data-testid="project-scans"
        className="rounded-md border border-[#1f242d] bg-[#11141b]"
      >
        <header className="flex items-center justify-between border-b border-[#1f242d] px-4 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#10b981]">
            Scan history
          </h2>
          <span className="text-xs text-[#6b7280]">
            {totalScans} scan{totalScans === 1 ? '' : 's'}
          </span>
        </header>
        {scans.length === 0 ? (
          <p
            data-testid="project-scans-empty"
            className="px-4 py-6 text-center text-xs text-[#6b7280]"
          >
            No scans attached to this project yet. Run{' '}
            <code className="text-[#10b981]">audithex scan --project {project.name}</code> from the
            CLI to populate the list.
          </p>
        ) : (
          <ul className="divide-y divide-[#1f242d] text-xs">
            {scans.map((run) => {
              const { critical, high, medium, low } = run.severityCounts;
              return (
                <li
                  key={run.id}
                  data-testid="project-scan-row"
                  className="flex flex-wrap items-baseline gap-4 px-4 py-2"
                >
                  <Link
                    href={`/scans/${run.id}`}
                    className="font-mono text-[#10b981] hover:text-[#f97316]"
                  >
                    {shortId(run.id)}
                  </Link>
                  <span className="text-[#d4d4d4]">{formatTimestamp(run.scannedAt)}</span>
                  <SeverityBadge severity={run.topSeverity} />
                  <span className="text-[#d4d4d4]">
                    C{critical} H{high} M{medium} L{low}
                  </span>
                  <span className="text-[#6b7280]">{formatMs(run.elapsedMs)}</span>
                  <span className="text-[#6b7280]" title={run.rootPath}>
                    {compactPath(run.rootPath)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
