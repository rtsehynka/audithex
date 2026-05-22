import { getAiSettings } from '@audithex/core-persistence';
import type { ReactElement } from 'react';
import AiSettingsForm from '../../../components/ai-settings-form';
import AppShell from '../../../components/app-shell';
import PageContainer from '../../../components/page-container';
import PageHeader from '../../../components/page-header';
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
    <AppShell sessionEmail={session.email} active="settings">
      <PageContainer>
        <PageHeader
          title="AI provider"
          back={{ href: '/settings', label: 'Settings' }}
          subtitle={
            <>
              Picks the LLM backing the{' '}
              <strong className="text-[#d4d4d4]">Explain how to fix</strong> button on every
              finding. All three providers run direct from this server — no third party in the
              middle. The key is stored in MongoDB on this machine; clear the field and save to fall
              back to the <code>ANTHROPIC_API_KEY</code> environment variable.
            </>
          }
        />

        <section
          data-testid="ai-settings-card"
          className="rounded-md border border-[#1f242d] bg-[#11141b] p-4"
        >
          <AiSettingsForm initial={initial} action={saveAiSettingsAction} />
        </section>
      </PageContainer>
    </AppShell>
  );
}
