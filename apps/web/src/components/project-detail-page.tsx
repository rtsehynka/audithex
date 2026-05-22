import Link from 'next/link';
import type { ReactElement } from 'react';
import { deleteProjectAction, updateProjectAction } from '../app/projects/actions';
import { compactPath, formatMs, formatTimestamp, shortId } from '../lib/format';
import type { ProjectView } from '../lib/projects';
import type { ScanRunSummary } from '../lib/queries';
import type { RuleOption } from '../lib/rules';
import AppShell from './app-shell';
import PageContainer from './page-container';
import PageHeader from './page-header';
import ProjectForm from './project-form';
import RunScanCard from './run-scan-card';
import SeverityBadge from './severity-badge';

interface Props {
  project: ProjectView;
  scans: ScanRunSummary[];
  totalScans: number;
  sessionEmail: string;
  rules: RuleOption[];
  aiConfigured: boolean;
}

export default function ProjectDetailPage({
  project,
  scans,
  totalScans,
  sessionEmail,
  rules,
  aiConfigured,
}: Props): ReactElement {
  const bound = updateProjectAction.bind(null, project.id);
  const deleteBound = deleteProjectAction.bind(null, project.id);
  return (
    <AppShell sessionEmail={sessionEmail} active="projects">
      <PageContainer>
        <PageHeader
          title={project.name}
          titleTestid="project-title"
          back={{ href: '/projects', label: 'All projects' }}
          subtitle={
            <>
              Root:{' '}
              <span className="font-mono text-[#d4d4d4]" data-testid="detail-root-path">
                {project.rootPath}
              </span>
            </>
          }
          actions={
            <form action={deleteBound}>
              <button
                type="submit"
                data-testid="delete-project"
                className="rounded-md border border-[#1f242d] bg-[#11141b] px-3 py-1.5 text-xs text-[#ef4444] hover:border-[#ef4444]"
              >
                Delete project
              </button>
            </form>
          }
        />

        <section
          data-testid="edit-card"
          className="rounded-md border border-[#1f242d] bg-[#11141b] p-4"
        >
          <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#10b981]">
              Project settings
            </h2>
            <p className="text-[10px] text-[#6b7280]">
              Edits take effect on the next <code>audithex scan --project {project.name}</code> or
              web run. Scans already in the database keep their original severities.
            </p>
          </header>
          <ProjectForm
            initial={project}
            submitLabel="Save changes"
            action={bound}
            rules={rules}
            aiConfigured={aiConfigured}
          />
        </section>

        <RunScanCard projectId={project.id} projectName={project.name} />

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
              <code className="text-[#10b981]">audithex scan --project {project.name}</code> from
              the CLI to populate the list.
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
      </PageContainer>
    </AppShell>
  );
}
