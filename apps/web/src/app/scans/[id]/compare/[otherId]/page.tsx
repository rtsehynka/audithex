import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import ScanComparePage from '../../../../../components/scan-compare-page';
import { requireSession } from '../../../../../lib/auth';
import { diffScans } from '../../../../../lib/diff';
import { getScan } from '../../../../../lib/queries';

export const dynamic = 'force-dynamic';

export default async function ScanDiffPage({
  params,
}: {
  params: Promise<{ id: string; otherId: string }>;
}): Promise<ReactElement> {
  const session = await requireSession();
  const { id, otherId } = await params;
  const [candidate, baselineCandidate] = await Promise.all([getScan(id), getScan(otherId)]);
  if (!candidate || !baselineCandidate) notFound();

  // Treat the older `scannedAt` as the baseline regardless of URL
  // ordering. The diff is "what changed in the candidate compared to
  // the baseline" — added means the candidate sees it, removed means
  // it was only in the baseline.
  const [baseline, newer] = ordered(baselineCandidate, candidate);
  const diff = diffScans(baseline.findings, newer.findings);

  return (
    <ScanComparePage
      baseline={baseline}
      candidate={newer}
      diff={diff}
      sessionEmail={session.email}
    />
  );
}

function ordered<T extends { scannedAt: string }>(a: T, b: T): [T, T] {
  if (Date.parse(a.scannedAt) <= Date.parse(b.scannedAt)) return [a, b];
  return [b, a];
}
