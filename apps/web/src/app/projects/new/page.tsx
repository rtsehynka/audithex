import Link from 'next/link';
import type { ReactElement } from 'react';
import ProjectForm from '../../../components/project-form';
import { requireSession } from '../../../lib/auth';
import { listAvailableRules } from '../../../lib/rules';
import { createProjectAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NewProjectPage(): Promise<ReactElement> {
  const session = await requireSession();
  const rules = await listAvailableRules();
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="border-b border-[#1f242d] pb-4">
        <Link
          href="/projects"
          data-testid="back-link"
          className="text-xs text-[#6b7280] hover:text-[#10b981]"
        >
          ← All projects
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-[#10b981]">New project</h1>
        <p className="text-xs text-[#6b7280]">
          Signed in as <span data-testid="session-email">{session.email}</span>. Filling this form
          creates a record in MongoDB you can target with{' '}
          <code className="text-[#10b981]">audithex scan --project &lt;name&gt;</code>.
        </p>
      </header>

      <section className="rounded-md border border-[#1f242d] bg-[#11141b] p-4">
        <ProjectForm submitLabel="Create project" action={createProjectAction} rules={rules} />
      </section>
    </main>
  );
}
