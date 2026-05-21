import type { ReactElement } from 'react';
import SettingsPage from '../../components/settings-page';
import { requireSession } from '../../lib/auth';
import { loadSettingsSnapshot } from '../../lib/settings';

export const dynamic = 'force-dynamic';

export default async function SettingsRoute(): Promise<ReactElement> {
  const session = await requireSession();
  const data = await loadSettingsSnapshot();
  return <SettingsPage data={data} sessionEmail={session.email} />;
}
