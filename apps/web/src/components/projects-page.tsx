import Link from 'next/link';
import type { ReactElement } from 'react';
import type { ProjectView } from '../lib/projects';
import AppShell from './app-shell';
import PageContainer from './page-container';
import PageHeader from './page-header';
import { Td, Th } from './table-cells';

interface Props {
  projects: ProjectView[];
  sessionEmail: string;
}

export default function ProjectsPage({ projects, sessionEmail }: Props): ReactElement {
  return (
    <AppShell sessionEmail={sessionEmail} active="projects">
      <PageContainer>
        <PageHeader
          title="Projects"
          subtitle={
            <>
              {projects.length} project{projects.length === 1 ? '' : 's'} configured. Each project
              pins a root path, a rules profile and an optional database connection.
            </>
          }
          actions={
            <Link
              href="/projects/new"
              data-testid="new-project"
              className="rounded-md bg-[#10b981] px-3 py-1.5 text-xs font-semibold text-[#0b0e14] hover:bg-[#f97316]"
            >
              + New project
            </Link>
          }
        />

        {projects.length === 0 ? (
          <p
            data-testid="projects-empty"
            className="rounded-md border border-dashed border-[#1f242d] bg-[#11141b] px-6 py-10 text-center text-xs text-[#6b7280]"
          >
            No projects yet. Click <strong className="text-[#10b981]">+ New project</strong> to add
            one, or run <code className="text-[#10b981]">audithex project create</code> from the
            CLI.
          </p>
        ) : (
          <section
            data-testid="projects-table"
            className="overflow-x-auto rounded-md border border-[#1f242d] bg-[#11141b]"
          >
            <table className="min-w-full divide-y divide-[#1f242d] text-sm">
              <thead className="bg-[#0e1119] text-[#6b7280]">
                <tr>
                  <Th>Name</Th>
                  <Th>Root path</Th>
                  <Th>Disabled rules</Th>
                  <Th>Overrides</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f242d]">
                {projects.map((p) => (
                  <tr
                    key={p.id}
                    data-testid="project-row"
                    data-project-id={p.id}
                    className="hover:bg-[rgba(16,185,129,0.04)]"
                  >
                    <Td>
                      <Link
                        href={`/projects/${p.id}`}
                        data-testid="project-link"
                        className="font-mono text-[#10b981] hover:text-[#f97316]"
                      >
                        {p.name}
                      </Link>
                    </Td>
                    <Td className="text-[#d4d4d4]" title={p.rootPath}>
                      {p.rootPath}
                    </Td>
                    <Td className="text-[#6b7280]">
                      {p.disabledRuleIds.length === 0 ? '—' : p.disabledRuleIds.join(', ')}
                    </Td>
                    <Td className="text-[#6b7280]">
                      {Object.keys(p.severityOverrides).length === 0
                        ? '—'
                        : Object.entries(p.severityOverrides)
                            .map(([id, sev]) => `${id}=${sev}`)
                            .join(', ')}
                    </Td>
                    <Td className="text-[#6b7280]">{p.updatedAt.slice(0, 16).replace('T', ' ')}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </PageContainer>
    </AppShell>
  );
}
