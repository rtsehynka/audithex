import type { ReactElement } from 'react';
import ProjectsPage from '../../components/projects-page';
import { requireSession } from '../../lib/auth';
import { listProjectsForUI } from '../../lib/projects';

export const dynamic = 'force-dynamic';

export default async function ProjectsRoute(): Promise<ReactElement> {
  const session = await requireSession();
  const projects = await listProjectsForUI();
  return <ProjectsPage projects={projects} sessionEmail={session.email} />;
}
