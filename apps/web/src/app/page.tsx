import type { ReactElement } from 'react';
import ScanHistoryPage from '../components/scan-history-page';
import { requireSession } from '../lib/auth';
import { listScans } from '../lib/queries';

interface SearchParams {
  skip?: string;
  limit?: string;
}

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  const session = await requireSession();
  const params = await searchParams;
  const limit = clamp(parseIntOr(params.limit), 5, 100, 25);
  const skip = clamp(parseIntOr(params.skip), 0, Number.POSITIVE_INFINITY, 0);
  const data = await listScans({ limit, skip });
  return <ScanHistoryPage data={data} sessionEmail={session.email} />;
}

function parseIntOr(raw: string | undefined): number {
  if (!raw) return Number.NaN;
  return Number.parseInt(raw, 10);
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
