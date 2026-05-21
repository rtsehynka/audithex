import Link from 'next/link';
import type { ReactElement } from 'react';
import type { RuleOption } from '../lib/rules';
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
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[#1f242d] pb-4">
        <div>
          <Link
            href="/"
            data-testid="back-link"
            className="text-xs text-[#6b7280] hover:text-[#10b981]"
          >
            ← All scans
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-[#10b981]">Rules</h1>
          <p className="text-xs text-[#6b7280]">
            Signed in as <span data-testid="session-email">{sessionEmail}</span>.{' '}
            <span data-testid="rules-count">{rules.length}</span> rule
            {rules.length === 1 ? '' : 's'} in the active pack ({packVersion} ·{' '}
            <span data-testid="pack-source">{packSource}</span>). Update via{' '}
            <code className="text-[#10b981]">audithex update</code>.
          </p>
        </div>
      </header>

      <section
        data-testid="rules-table"
        className="overflow-x-auto rounded-md border border-[#1f242d] bg-[#11141b]"
      >
        <table className="min-w-full divide-y divide-[#1f242d] text-sm">
          <thead className="text-[#6b7280]">
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
    </main>
  );
}
