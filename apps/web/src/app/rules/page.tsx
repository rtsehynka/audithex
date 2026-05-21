import type { ReactElement } from 'react';
import RulesPage from '../../components/rules-page';
import { requireSession } from '../../lib/auth';
import { listAvailableRules, packMeta } from '../../lib/rules';

export const dynamic = 'force-dynamic';

export default async function RulesRoute(): Promise<ReactElement> {
  const session = await requireSession();
  const rules = await listAvailableRules();
  const meta = packMeta();
  return (
    <RulesPage
      rules={rules}
      packVersion={meta?.version ?? 'unknown'}
      packSource={meta?.source ?? 'unknown'}
      sessionEmail={session.email}
    />
  );
}
