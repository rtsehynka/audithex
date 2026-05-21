import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import RuleDetailPage from '../../../components/rule-detail-page';
import { requireSession } from '../../../lib/auth';
import { getRuleDetail } from '../../../lib/rules';

export const dynamic = 'force-dynamic';

const RULE_ID_PATTERN = /^R\d{3}$/;

export default async function RuleDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const session = await requireSession();
  const { id } = await params;
  if (!RULE_ID_PATTERN.test(id)) notFound();
  const rule = await getRuleDetail(id);
  if (!rule) notFound();
  return <RuleDetailPage rule={rule} sessionEmail={session.email} />;
}
