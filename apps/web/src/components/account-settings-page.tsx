import Link from 'next/link';
import type { ReactElement } from 'react';
import { changeEmailAction, changePasswordAction } from '../app/settings/account/actions';
import AccountForm from './account-form';

interface Props {
  sessionEmail: string;
}

export default function AccountSettingsPage({ sessionEmail }: Props): ReactElement {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="border-b border-[#1f242d] pb-4">
        <Link
          href="/settings"
          data-testid="back-link"
          className="text-xs text-[#6b7280] hover:text-[#10b981]"
        >
          ← Settings
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-[#10b981]">Account</h1>
        <p className="text-xs text-[#6b7280]">
          Signed in as <span data-testid="session-email">{sessionEmail}</span>. Audithex is
          single-user — changes here update the local user document in MongoDB.
        </p>
      </header>

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
    </main>
  );
}
