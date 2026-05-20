import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import ScanDetailPage from '../../../components/scan-detail-page';
import { requireSession } from '../../../lib/auth';
import { getScan } from '../../../lib/queries';

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
  return <ScanDetailPage scan={scan} sessionEmail={session.email} />;
}
