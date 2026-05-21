import Link from 'next/link';
import type { ReactElement } from 'react';
import type { SettingsSnapshot } from '../lib/settings';

interface Props {
  data: SettingsSnapshot;
  sessionEmail: string;
}

export default function SettingsPage({ data, sessionEmail }: Props): ReactElement {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="border-b border-[#1f242d] pb-4">
        <Link
          href="/"
          data-testid="back-link"
          className="text-xs text-[#6b7280] hover:text-[#10b981]"
        >
          ← All scans
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-[#10b981]">Settings</h1>
        <p className="text-xs text-[#6b7280]">
          Signed in as <span data-testid="session-email">{sessionEmail}</span>. Project-level
          overrides live in <code className="text-[#10b981]">.audithex/config.json</code>; the CLI
          owns the on-disk truth.
        </p>
        <p className="mt-2 text-xs">
          <Link
            href="/settings/account"
            data-testid="account-link"
            className="text-[#10b981] hover:text-[#f97316]"
          >
            → Change email or password
          </Link>
        </p>
        <p className="mt-1 text-xs">
          <Link
            href="/settings/ai"
            data-testid="ai-settings-link"
            className="text-[#10b981] hover:text-[#f97316]"
          >
            → Configure AI provider (Anthropic / OpenAI / Gemini)
          </Link>
        </p>
      </header>

      <Card title="Audithex" testid="card-audithex">
        <Row label="CLI version" value={data.audithex.version} testid="audithex-version" />
        <Row label="Session TTL" value={`${data.session.ttlSeconds} s`} testid="session-ttl" />
        <Row label="Cookie name" value={data.session.cookieName} testid="cookie-name" />
      </Card>

      <Card title="MongoDB" testid="card-mongo">
        <Row label="Connection" value={data.mongo.uriDisplay} testid="mongo-uri" />
        <Row label="Database" value={data.mongo.dbName} testid="mongo-db" />
        <Row
          label="Status"
          value={
            data.mongo.connected ? 'connected' : `disconnected — ${data.mongo.error ?? 'unknown'}`
          }
          testid="mongo-status"
          tone={data.mongo.connected ? 'ok' : 'error'}
        />
        <Row
          label="scan_runs count"
          value={data.mongo.scanCount === null ? '—' : String(data.mongo.scanCount)}
          testid="mongo-scan-count"
        />
      </Card>

      <Card title="Rules pack" testid="card-rules-pack">
        <p className="text-xs text-[#6b7280]">{data.rulesPack.sourceHint}</p>
        {data.recentUpdates.length === 0 ? (
          <p data-testid="no-rules-pack-updates" className="mt-2 text-xs text-[#6b7280]">
            No recorded rules-pack updates yet. Run{' '}
            <code className="text-[#10b981]">audithex update</code> to bring one in.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[#1f242d] text-xs">
            {data.recentUpdates.map((u) => (
              <li key={String(u._id)} data-testid="rules-pack-update" className="py-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-[#10b981]">{u.outcome}</span>
                  <span className="text-[#6b7280]">
                    {u.fromVersion ?? '—'} → {u.toVersion ?? '—'}
                  </span>
                  <span className="text-[#6b7280]">{shortCommit(u.toCommit)}</span>
                  <span className="text-[#6b7280]">{new Date(u.occurredAt).toISOString()}</span>
                </div>
                {u.reason ? <p className="mt-0.5 text-[#d4d4d4]">{u.reason}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}

function Card({
  title,
  testid,
  children,
}: {
  title: string;
  testid: string;
  children: React.ReactNode;
}): ReactElement {
  return (
    <section data-testid={testid} className="rounded-md border border-[#1f242d] bg-[#11141b] p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[#10b981]">{title}</h2>
      <div className="mt-3 flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  testid,
  tone = 'default',
}: {
  label: string;
  value: string;
  testid: string;
  tone?: 'default' | 'ok' | 'error';
}): ReactElement {
  const toneClass =
    tone === 'ok' ? 'text-[#10b981]' : tone === 'error' ? 'text-[#ef4444]' : 'text-[#d4d4d4]';
  return (
    <div className="grid grid-cols-3 items-baseline gap-2 text-xs">
      <span className="text-[10px] uppercase tracking-wide text-[#6b7280]">{label}</span>
      <span data-testid={testid} className={`col-span-2 font-mono ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}

function shortCommit(commit: string | null): string {
  if (!commit) return '—';
  return commit.slice(0, 8);
}
