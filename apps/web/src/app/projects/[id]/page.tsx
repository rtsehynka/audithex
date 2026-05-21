import { listScanRuns } from '@audithex/core-persistence';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import ProjectDetailPage from '../../../components/project-detail-page';
import { requireSession } from '../../../lib/auth';
import { getConnection } from '../../../lib/db';
import { getProjectForUI } from '../../../lib/projects';
import { type ScanRunSummary, toScanRunSummary } from '../../../lib/queries';
import { listAvailableRules } from '../../../lib/rules';

export const dynamic = 'force-dynamic';

export default async function ProjectDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const session = await requireSession();
  const { id } = await params;
  const project = await getProjectForUI(id);
  if (!project) notFound();

  const conn = await getConnection();
  const docs = await listScanRuns(conn, { projectId: project.id, limit: 25 });
  // Approximate total = the size of a 1k-cap pull. Good enough until we
  // add a per-project count accessor.
  const all = await listScanRuns(conn, { projectId: project.id, limit: 1_000 });
  const total = all.length;

  const scans: ScanRunSummary[] = docs.map((doc) => toScanRunSummary(doc, project.name));
  const rules = await listAvailableRules();

  return (
    <ProjectDetailPage
      project={project}
      scans={scans}
      totalScans={total}
      sessionEmail={session.email}
      rules={rules}
    />
  );
}
