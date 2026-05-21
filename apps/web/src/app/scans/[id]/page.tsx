import { listAiFixesForScan } from '@audithex/core-persistence';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import ScanDetailPage, { type CachedFix } from '../../../components/scan-detail-page';
import { requireSession } from '../../../lib/auth';
import { getConnection } from '../../../lib/db';
import { isLlmAvailable, llmProviderName } from '../../../lib/llm';
import { getScan, listComparisonOptions } from '../../../lib/queries';

export const dynamic = 'force-dynamic';

export default async function ScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const session = await requireSession();
  const { id } = await params;
  const scan = await getScan(id);
  if (!scan) notFound();
  const conn = await getConnection();
  const [compareOptions, fixDocs] = await Promise.all([
    listComparisonOptions({ excludeId: scan.id }),
    listAiFixesForScan(conn, scan.id),
  ]);
  const cachedFixes: CachedFix[] = fixDocs.map((doc) => ({
    findingKey: doc.findingKey,
    provider: doc.provider,
    model: doc.model,
    costUsd: doc.costUsd,
    response: doc.response,
  }));
  return (
    <ScanDetailPage
      scan={scan}
      sessionEmail={session.email}
      compareOptions={compareOptions}
      llmAvailable={isLlmAvailable()}
      llmProvider={llmProviderName()}
      cachedFixes={cachedFixes}
    />
  );
}
