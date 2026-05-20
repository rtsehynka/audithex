import type { ReactNode } from 'react';
import { requireSession } from '../lib/auth';
import { logoutAction } from './logout/actions';

export default async function HomePage(): Promise<ReactNode> {
  const session = await requireSession();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="border-b border-[var(--color-border)] pb-4">
        <h1 className="text-2xl font-semibold text-[var(--color-accent)]">Audithex</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Signed in as <span data-testid="session-email">{session.email}</span>.
        </p>
      </header>

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-pane)] p-6">
        <h2 className="text-lg font-semibold text-[var(--color-accent)]">Welcome</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          The scan history list, finding detail view, and diff between runs live in subsequent
          feature drops. This page is the protected entry point and confirms session, MongoDB
          connectivity, and middleware routing are all green.
        </p>
      </section>

      <form action={logoutAction}>
        <button
          type="submit"
          data-testid="logout-button"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-pane)] px-4 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-accent-warm)] hover:text-[var(--color-accent-warm)]"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
