import { getAiSettings } from '@audithex/core-persistence';
import type { ReactElement } from 'react';
import AppShell from '../../../components/app-shell';
import PageContainer from '../../../components/page-container';
import PageHeader from '../../../components/page-header';
import ProjectForm from '../../../components/project-form';
import { requireSession } from '../../../lib/auth';
import { getConnection } from '../../../lib/db';
import { listAvailableRules } from '../../../lib/rules';
import { createProjectAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NewProjectPage(): Promise<ReactElement> {
  const session = await requireSession();
  const rules = await listAvailableRules();
  const conn = await getConnection();
  const ai = await getAiSettings(conn);
  const aiConfigured = Boolean(ai?.apiKey && ai.apiKey.length > 0);
  return (
    <AppShell sessionEmail={session.email} active="projects">
      <PageContainer>
        <PageHeader
          title="New project"
          back={{ href: '/projects', label: 'All projects' }}
          subtitle={
            <>
              Filling this form creates a record in MongoDB you can target with{' '}
              <code className="text-[#10b981]">audithex scan --project &lt;name&gt;</code> or run
              from the web UI.
            </>
          }
        />

        <section className="rounded-md border border-[#1f242d] bg-[#11141b] p-4">
          <ProjectForm
            submitLabel="Create project"
            action={createProjectAction}
            rules={rules}
            aiConfigured={aiConfigured}
          />
        </section>
      </PageContainer>
    </AppShell>
  );
}
