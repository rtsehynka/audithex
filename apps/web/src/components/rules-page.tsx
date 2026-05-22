import Link from 'next/link';
import type { ReactElement } from 'react';
import type { RuleOption } from '../lib/rules';
import AppShell from './app-shell';
import PageContainer from './page-container';
import PageHeader from './page-header';
import SeverityBadge from './severity-badge';
import { Td, Th } from './table-cells';

interface Props {
  rules: RuleOption[];
  packVersion: string;
  packSource: string;
  sessionEmail: string;
}

export default function RulesPage({
  rules,
  packVersion,
  packSource,
  sessionEmail,
}: Props): ReactElement {
  return (
    <AppShell sessionEmail={sessionEmail} active="rules">
      <PageContainer>
        <PageHeader
          title="Rules"
          subtitle={
            <>
              <span data-testid="rules-count">{rules.length}</span> rule
              {rules.length === 1 ? '' : 's'} in the active pack ({packVersion} ·{' '}
              <span data-testid="pack-source">{packSource}</span>). Update with{' '}
              <code className="text-[#10b981]">audithex update</code>. Click any id for the full
              message + fix template + engine parameters.
            </>
          }
        />

        <section
          data-testid="rules-table"
          className="overflow-x-auto rounded-md border border-[#1f242d] bg-[#11141b]"
        >
          <table className="min-w-full divide-y divide-[#1f242d] text-sm">
            <thead className="bg-[#0e1119] text-[#6b7280]">
              <tr>
                <Th>Id</Th>
                <Th>Title</Th>
                <Th>Severity</Th>
                <Th>OWASP</Th>
                <Th>CWE</Th>
                <Th>Engine</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f242d]">
              {rules.map((rule) => (
                <tr
                  key={rule.id}
                  data-testid="rule-row"
                  data-rule-id={rule.id}
                  className="hover:bg-[rgba(16,185,129,0.04)]"
                >
                  <Td>
                    <Link
                      href={`/rules/${rule.id}`}
                      data-testid="rule-link"
                      className="font-mono text-[#10b981] hover:text-[#f97316]"
                    >
                      {rule.id}
                    </Link>
                  </Td>
                  <Td className="text-[#d4d4d4]">{rule.title}</Td>
                  <Td>
                    <SeverityBadge severity={rule.defaultSeverity} />
                  </Td>
                  <Td className="text-[#6b7280]">{rule.owasp.join(', ') || '—'}</Td>
                  <Td className="text-[#6b7280]">{rule.cwe ?? '—'}</Td>
                  <Td className="text-[#6b7280]">{rule.engine}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </PageContainer>
    </AppShell>
  );
}
