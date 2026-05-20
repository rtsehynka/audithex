import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { readSession } from '../../lib/auth';
import LoginForm from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}): Promise<ReactNode> {
  const session = await readSession();
  if (session) redirect('/');
  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-pane)] p-8">
        <h1 className="text-xl font-semibold text-[var(--color-accent)]">Sign in to Audithex</h1>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Local-only auth — your credentials never leave this machine.
        </p>
        <div className="mt-6">
          <LoginForm redirectTo={params.redirectTo ?? '/'} initialError={params.error ?? null} />
        </div>
      </div>
    </main>
  );
}
