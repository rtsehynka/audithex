import { t } from '@audithex/core-i18n';
import Link from 'next/link';
import type { ReactElement } from 'react';
import type { CoverageRow } from '../lib/coverage';
import AppShell from './app-shell';
import PageHeader from './page-header';

interface Props {
  rows: CoverageRow[];
  packVersion: string;
  packSource: string;
  sessionEmail: string;
}

export default function CoveragePage({
  rows,
  packVersion,
  packSource,
  sessionEmail,
}: Props): ReactElement {
  const covered = rows.filter((r) => r.rules.length > 0).length;
  return (
    <AppShell sessionEmail={sessionEmail} active="rules">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
        <PageHeader
          title="OWASP LLM Top 10 (2025) coverage"
          subtitle={
            <>
              {covered} of {rows.length} categories covered by the active rules pack ({packVersion}{' '}
              · {packSource}). Each row lists the rules currently mapped to that category and the
              honest status — static, dynamic-only, or out-of-scope for a code-static scanner.
            </>
          }
        />

        <section
          data-testid="coverage-matrix"
          className="overflow-x-auto rounded-md border border-[#1f242d] bg-[#11141b]"
        >
          <table className="min-w-full divide-y divide-[#1f242d] text-sm">
            <thead className="bg-[#0e1119] text-[#6b7280]">
              <tr>
                <Th>Category</Th>
                <Th>Status</Th>
                <Th>Rules</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f242d]">
              {rows.map(({ category, rules }) => (
                <tr
                  key={category.id}
                  data-testid="coverage-row"
                  data-category-id={category.id}
                  className="hover:bg-[rgba(16,185,129,0.04)]"
                >
                  <td className="px-3 py-3 align-top">
                    <div className="flex flex-col gap-0.5">
                      <span data-testid="coverage-category-id" className="font-mono text-[#10b981]">
                        {category.id}
                      </span>
                      <span data-testid="coverage-category-label" className="text-[#d4d4d4]">
                        {t(`findings:${category.labelKey}`)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <StatusBadge status={category.status} hasRules={rules.length > 0} />
                  </td>
                  <td className="px-3 py-3 align-top">
                    {rules.length === 0 ? (
                      <span data-testid="coverage-no-rules" className="text-[11px] text-[#6b7280]">
                        no rules yet
                      </span>
                    ) : (
                      <ul data-testid="coverage-rule-list" className="flex flex-wrap gap-1">
                        {rules.map((rule) => (
                          <li key={rule.id}>
                            <Link
                              href={`/rules/${rule.id}`}
                              data-testid="coverage-rule-link"
                              data-rule-id={rule.id}
                              className="rounded border border-[#1f242d] bg-[#0b0e14] px-1.5 py-0.5 font-mono text-[11px] text-[#10b981] hover:border-[#10b981] hover:text-[#f97316]"
                              title={rule.title}
                            >
                              {rule.id}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top text-[11px] leading-relaxed text-[#6b7280]">
                    {category.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <Legend />
      </div>
    </AppShell>
  );
}

function Th({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">
      {children}
    </th>
  );
}

function StatusBadge({
  status,
  hasRules,
}: {
  status: 'static' | 'dynamic' | 'out-of-scope';
  hasRules: boolean;
}): ReactElement {
  const map = {
    static: hasRules
      ? { label: 'covered', tone: 'bg-[#064e3b] text-[#a7f3d0]' }
      : { label: 'planned', tone: 'bg-[#1e3a8a] text-[#bfdbfe]' },
    dynamic: { label: 'dynamic only', tone: 'bg-[#854d0e] text-[#fde68a]' },
    'out-of-scope': { label: 'out of scope', tone: 'bg-[#1f242d] text-[#6b7280]' },
  };
  const { label, tone } = map[status];
  return (
    <span
      data-testid="coverage-status"
      data-status={status}
      data-has-rules={hasRules ? 'true' : 'false'}
      className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {label}
    </span>
  );
}

function Legend(): ReactElement {
  return (
    <section
      data-testid="coverage-legend"
      className="rounded-md border border-[#1f242d] bg-[#11141b] p-4 text-[11px] leading-relaxed text-[#6b7280]"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[#10b981]">Legend</h2>
      <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
        <li>
          <strong className="text-[#a7f3d0]">covered</strong> — at least one bundled rule fires on
          this category during a static scan.
        </li>
        <li>
          <strong className="text-[#bfdbfe]">planned</strong> — static rule planned but not yet
          shipped in this pack.
        </li>
        <li>
          <strong className="text-[#fde68a]">dynamic only</strong> — needs live-LLM probing; the
          dynamic-attack engine (week 2.5) will cover this.
        </li>
        <li>
          <strong className="text-[#d4d4d4]">out of scope</strong> — not lintable from source code
          alone (e.g. training-data poisoning).
        </li>
      </ul>
    </section>
  );
}
