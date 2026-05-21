import type { ReactElement } from 'react';
import AccountSettingsPage from '../../../components/account-settings-page';
import { requireSession } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

export default async function AccountSettingsRoute(): Promise<ReactElement> {
  const session = await requireSession();
  return <AccountSettingsPage sessionEmail={session.email} />;
}
