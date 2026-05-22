import type { ReactElement } from 'react';
import type { RuleDetail } from '../lib/rules';
import AppShell from './app-shell';
import PageHeader from './page-header';
import SeverityBadge from './severity-badge';

interface Props {
  rule: RuleDetail;
  sessionEmail: string;
}

export default function RuleDetailPage({ rule, sessionEmail }: Props): ReactElement {
  return (
    <AppShell sessionEmail={sessionEmail} active="rules">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
        <PageHeader
          title={rule.id}
          titleTestid="rule-id"
          back={{ href: '/rules', label: 'All rules' }}
          subtitle={
            <>
              Active rules pack <code className="text-[#10b981]">{rule.rulesPackVersion}</code> (
              {rule.rulesPackSource}).
            </>
          }
          actions={
            <div className="flex items-baseline gap-2">
              <SeverityBadge severity={rule.defaultSeverity} />
              <span data-testid="rule-title" className="text-sm text-[#d4d4d4]">
                {rule.title}
              </span>
            </div>
          }
        />

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
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#10b981]">
            How to fix
          </h2>
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
      </div>
    </AppShell>
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
