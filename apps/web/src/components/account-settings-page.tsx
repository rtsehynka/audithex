import type { ReactElement } from 'react';
import { changeEmailAction, changePasswordAction } from '../app/settings/account/actions';
import AccountForm from './account-form';
import AppShell from './app-shell';
import PageContainer from './page-container';
import PageHeader from './page-header';

interface Props {
  sessionEmail: string;
}

export default function AccountSettingsPage({ sessionEmail }: Props): ReactElement {
  return (
    <AppShell sessionEmail={sessionEmail} active="settings">
      <PageContainer>
        <PageHeader
          title="Account"
          back={{ href: '/settings', label: 'Settings' }}
          subtitle={
            <>Audithex is single-user — changes here update the local user document in MongoDB.</>
          }
        />

        <AccountForm
          testid="change-email-card"
          title="Change email"
          description="Updates the address tied to this account. The session cookie is re-issued so you stay signed in under the new email."
          fields={[
            {
              name: 'currentPassword',
              label: 'Current password',
              type: 'password',
              required: true,
              testid: 'email-current-password',
            },
            {
              name: 'newEmail',
              label: 'New email',
              type: 'email',
              required: true,
              testid: 'email-new',
            },
          ]}
          submitLabel="Update email"
          successLabel="Email updated. Session re-issued."
          action={changeEmailAction}
        />

        <AccountForm
          testid="change-password-card"
          title="Change password"
          description="Bcrypt hash is rotated in place — any in-flight session keeps working until the cookie expires."
          fields={[
            {
              name: 'currentPassword',
              label: 'Current password',
              type: 'password',
              required: true,
              testid: 'pw-current',
            },
            {
              name: 'newPassword',
              label: 'New password (min 8 chars)',
              type: 'password',
              required: true,
              testid: 'pw-new',
            },
            {
              name: 'confirmPassword',
              label: 'Repeat new password',
              type: 'password',
              required: true,
              testid: 'pw-confirm',
            },
          ]}
          submitLabel="Update password"
          successLabel="Password updated."
          action={changePasswordAction}
        />
      </PageContainer>
    </AppShell>
  );
}
