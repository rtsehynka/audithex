import { getAiSettings } from '@audithex/core-persistence';
import Link from 'next/link';
import type { ReactElement } from 'react';
import AiSettingsForm from '../../../components/ai-settings-form';
import { requireSession } from '../../../lib/auth';
import { getConnection } from '../../../lib/db';
import { saveAiSettingsAction } from './actions';

export const dynamic = 'force-dynamic';

const DEFAULTS = {
  provider: 'anthropic' as const,
  model: 'claude-sonnet-4-6',
  costCapUsd: 1.0,
};

export default async function AiSettingsRoute(): Promise<ReactElement> {
  const session = await requireSession();
  const conn = await getConnection();
  const saved = await getAiSettings(conn);
  const initial = {
    provider: saved?.provider ?? DEFAULTS.provider,
    apiKey: '',
    model: saved?.model ?? DEFAULTS.model,
    costCapUsd: saved?.costCapUsd ?? DEFAULTS.costCapUsd,
    hasKey: Boolean(saved?.apiKey && saved.apiKey.length > 0),
  };
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
        <h1 className="mt-1 text-2xl font-semibold text-[#10b981]">AI provider</h1>
        <p className="text-xs text-[#6b7280]">
          Signed in as <span data-testid="session-email">{session.email}</span>. Picks the LLM
          backing the <strong className="text-[#d4d4d4]">Explain how to fix</strong> button on every
          finding. All three providers run direct from this server — no third party in the middle.
          The key is stored in MongoDB on this machine; cancel out by clearing the field and saving
          to fall back to the <code>ANTHROPIC_API_KEY</code> environment variable.
        </p>
      </header>

      <section
        data-testid="ai-settings-card"
        className="rounded-md border border-[#1f242d] bg-[#11141b] p-4"
      >
        <AiSettingsForm initial={initial} action={saveAiSettingsAction} />
      </section>
    </main>
  );
}
