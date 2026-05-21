import Link from 'next/link';
import type { ReactElement } from 'react';
import type { RuleDetail } from '../lib/rules';
import SeverityBadge from './severity-badge';

interface Props {
  rule: RuleDetail;
  sessionEmail: string;
}

export default function RuleDetailPage({ rule, sessionEmail }: Props): ReactElement {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="border-b border-[#1f242d] pb-4">
        <Link
          href="/rules"
          data-testid="back-link"
          className="text-xs text-[#6b7280] hover:text-[#10b981]"
        >
          ← All rules
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          <h1 className="font-mono text-2xl font-semibold text-[#10b981]" data-testid="rule-id">
            {rule.id}
          </h1>
          <SeverityBadge severity={rule.defaultSeverity} />
          <span data-testid="rule-title" className="text-lg text-[#d4d4d4]">
            {rule.title}
          </span>
        </div>
        <p className="mt-2 text-xs text-[#6b7280]">
          Signed in as <span data-testid="session-email">{sessionEmail}</span>. Active rules pack{' '}
          <code className="text-[#10b981]">{rule.rulesPackVersion}</code> ({rule.rulesPackSource}).
        </p>
      </header>

      <section
        data-testid="rule-meta"
        className="grid grid-cols-2 gap-3 rounded-md border border-[#1f242d] bg-[#11141b] p-4 text-xs sm:grid-cols-4"
      >
        <MetaCell label="OWASP" value={rule.owasp.join(', ') || '—'} testid="meta-owasp" />
        <MetaCell label="CWE" value={rule.cwe ?? '—'} testid="meta-cwe" />
        <MetaCell label="Engine" value={rule.engine} testid="meta-engine" />
        <MetaCell
          label="Languages"
          value={rule.languages.length === 0 ? 'any' : rule.languages.join(', ')}
          testid="meta-languages"
        />
      </section>

      <section
        data-testid="rule-message"
        className="rounded-md border border-[#1f242d] bg-[#11141b] p-4"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#10b981]">Message</h2>
        <p className="mt-2 whitespace-pre-wrap font-mono text-xs text-[#d4d4d4]">
          {rule.messageTemplate || '(no message template — fix the i18n key)'}
        </p>
      </section>

      <section
        data-testid="rule-fix"
        className="rounded-md border border-[#1f242d] bg-[#11141b] p-4"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#10b981]">How to fix</h2>
        <p className="mt-2 whitespace-pre-wrap text-xs text-[#d4d4d4]">
          {rule.fixTemplate || '(no fix template — fix the i18n key)'}
        </p>
      </section>

      <section
        data-testid="rule-engine-params"
        className="rounded-md border border-[#1f242d] bg-[#11141b] p-4"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#10b981]">
          Engine parameters
        </h2>
        <pre className="mt-2 overflow-x-auto rounded bg-[#0b0e14] p-3 text-[11px] text-[#d4d4d4]">
          {JSON.stringify(rule.params, null, 2)}
        </pre>
      </section>

      {Object.keys(rule.meta).length > 0 ? (
        <section
          data-testid="rule-meta-block"
          className="rounded-md border border-[#1f242d] bg-[#11141b] p-4"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#10b981]">
            References &amp; meta
          </h2>
          <pre className="mt-2 overflow-x-auto rounded bg-[#0b0e14] p-3 text-[11px] text-[#d4d4d4]">
            {JSON.stringify(rule.meta, null, 2)}
          </pre>
        </section>
      ) : null}
    </main>
  );
}

function MetaCell({
  label,
  value,
  testid,
}: {
  label: string;
  value: string;
  testid: string;
}): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#6b7280]">
        {label}
      </span>
      <span data-testid={testid} className="font-mono text-xs text-[#d4d4d4]">
        {value}
      </span>
    </div>
  );
}
