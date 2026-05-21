import Link from 'next/link';
import type { ReactElement } from 'react';
import type { ProjectView } from '../lib/projects';
import { Td, Th } from './table-cells';

interface Props {
  projects: ProjectView[];
  sessionEmail: string;
}

export default function ProjectsPage({ projects, sessionEmail }: Props): ReactElement {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[#1f242d] pb-4">
        <div>
          <Link
            href="/"
            data-testid="back-link"
            className="text-xs text-[#6b7280] hover:text-[#10b981]"
          >
            ← All scans
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-[#10b981]">Projects</h1>
          <p className="text-xs text-[#6b7280]">
            Signed in as <span data-testid="session-email">{sessionEmail}</span>. {projects.length}{' '}
            project{projects.length === 1 ? '' : 's'} configured.
          </p>
        </div>
        <Link
          href="/projects/new"
          data-testid="new-project"
          className="rounded-md bg-[#10b981] px-3 py-1.5 text-xs font-semibold text-[#0b0e14] hover:bg-[#f97316]"
        >
          + New project
        </Link>
      </header>

      {projects.length === 0 ? (
        <p
          data-testid="projects-empty"
          className="rounded-md border border-dashed border-[#1f242d] bg-[#11141b] px-6 py-10 text-center text-xs text-[#6b7280]"
        >
          No projects yet. Click <strong className="text-[#10b981]">+ New project</strong> to add
          one, or run <code className="text-[#10b981]">audithex project create</code> from the CLI.
        </p>
      ) : (
        <section
          data-testid="projects-table"
          className="overflow-x-auto rounded-md border border-[#1f242d] bg-[#11141b]"
        >
          <table className="min-w-full divide-y divide-[#1f242d] text-sm">
            <thead className="text-[#6b7280]">
              <tr>
                <Th>Name</Th>
                <Th>Root path</Th>
                <Th>Disabled</Th>
                <Th>Overrides</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f242d]">
              {projects.map((p) => (
                <tr key={p.id} data-testid="project-row" data-project-id={p.id}>
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
    </main>
  );
}
