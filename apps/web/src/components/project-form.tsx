'use client';

import Link from 'next/link';
import { type ReactElement, type ReactNode, useActionState, useMemo, useState } from 'react';
import type { ProjectActionResult } from '../app/projects/actions';
import type { ProjectView } from '../lib/projects';
import type { RuleOption } from '../lib/rules';

interface Props {
  initial?: ProjectView | null;
  submitLabel: string;
  action: (prev: ProjectActionResult | null, fd: FormData) => Promise<ProjectActionResult>;
  rules: RuleOption[];
  /** Whether an AI provider key is configured (drives the warning banner). */
  aiConfigured: boolean;
}

const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
type Severity = (typeof SEVERITIES)[number];
type RuleState = { enabled: boolean; override: Severity | '' };

type TabId = 'basics' | 'scope' | 'rules' | 'database';

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: 'basics', label: 'Basics', hint: 'Name, root path, description' },
  { id: 'scope', label: 'Scan scope', hint: 'OWASP groups, languages, extensions' },
  { id: 'rules', label: 'Rules', hint: 'Per-rule overrides' },
  { id: 'database', label: 'Database', hint: 'Optional Postgres / MongoDB' },
];

export default function ProjectForm({
  initial,
  submitLabel,
  action,
  rules,
  aiConfigured,
}: Props): ReactElement {
  const [state, formAction, pending] = useActionState<ProjectActionResult | null, FormData>(
    async (_prev, fd) => action(_prev, fd),
    null,
  );
  const fieldError = (key: string): string | undefined => state?.fieldErrors?.[key];

  const initialDisabled = useMemo(
    () => new Set(initial?.disabledRuleIds ?? []),
    [initial?.disabledRuleIds],
  );
  const initialRuleState: Record<string, RuleState> = {};
  for (const r of rules) {
    initialRuleState[r.id] = {
      enabled: !initialDisabled.has(r.id),
      override: (initial?.severityOverrides?.[r.id] as Severity | undefined) ?? '',
    };
  }
  const [ruleState, setRuleState] = useState<Record<string, RuleState>>(() => initialRuleState);

  const initialDisabledGroups = useMemo(
    () => new Set(initial?.disabledOwaspGroups ?? []),
    [initial?.disabledOwaspGroups],
  );
  const [groupEnabled, setGroupEnabled] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const g of OWASP_GROUPS) out[g.id] = !initialDisabledGroups.has(g.id);
    return out;
  });

  const [tab, setTab] = useState<TabId>('basics');

  const setEnabled = (id: string, enabled: boolean): void => {
    setRuleState((prev) => {
      const existing = prev[id];
      const next: RuleState = existing ? { ...existing, enabled } : { enabled, override: '' };
      return { ...prev, [id]: next };
    });
  };
  const setOverride = (id: string, override: Severity | ''): void => {
    setRuleState((prev) => {
      const existing = prev[id];
      const next: RuleState = existing ? { ...existing, override } : { enabled: true, override };
      return { ...prev, [id]: next };
    });
  };

  const aiGroupActiveWithoutKey =
    !aiConfigured && OWASP_GROUPS.some((g) => g.requiresAiKey && groupEnabled[g.id]);

  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid="project-form">
      <nav
        data-testid="project-tabs"
        className="flex flex-wrap gap-1 rounded-md border border-[#1f242d] bg-[#0e1119] p-1"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              type="button"
              key={t.id}
              data-testid={`tab-${t.id}`}
              data-tab-id={t.id}
              data-active={active ? 'true' : 'false'}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 flex-col items-start gap-0.5 rounded px-3 py-2 text-left text-xs transition ${
                active
                  ? 'bg-[#10b981] text-[#0b0e14]'
                  : 'text-[#d4d4d4] hover:bg-[#11141b] hover:text-[#10b981]'
              }`}
            >
              <span className="text-sm font-semibold">{t.label}</span>
              <span className={`text-[10px] ${active ? 'text-[#0b0e14]/70' : 'text-[#6b7280]'}`}>
                {t.hint}
              </span>
            </button>
          );
        })}
      </nav>

      {aiGroupActiveWithoutKey ? (
        <p
          data-testid="ai-key-warning"
          className="rounded-md border border-[#854d0e] bg-[rgba(255,193,7,0.05)] px-3 py-2 text-xs text-[#fde68a]"
        >
          One or more enabled scope groups need an LLM key (e.g.{' '}
          <strong>LLM09 Misinformation</strong>) but no AI provider is configured. Set one on{' '}
          <Link href="/settings/ai" className="underline">
            /settings/ai
          </Link>{' '}
          or uncheck those groups under <strong>Scan scope</strong>.
        </p>
      ) : null}

      <TabPanel id="basics" current={tab}>
        <Field
          name="name"
          label="Name"
          required
          defaultValue={initial?.name}
          testid="project-name"
          error={fieldError('name')}
        />
        <Field
          name="rootPath"
          label="Root path (absolute)"
          required
          defaultValue={initial?.rootPath}
          testid="project-root-path"
          error={fieldError('rootPath')}
        />
        <Field
          name="description"
          label="Description"
          defaultValue={initial?.description ?? ''}
          testid="project-description"
          error={fieldError('description')}
        />
      </TabPanel>

      <TabPanel id="scope" current={tab}>
        <ScanScopeSection
          initial={initial}
          groupEnabled={groupEnabled}
          onToggleGroup={(id, on) => setGroupEnabled((prev) => ({ ...prev, [id]: on }))}
        />
      </TabPanel>

      <TabPanel id="rules" current={tab}>
        <RulesSection
          rules={rules}
          ruleState={ruleState}
          onSetEnabled={setEnabled}
          onSetOverride={setOverride}
        />
      </TabPanel>

      <TabPanel id="database" current={tab}>
        <DatabaseSection initial={initial} fieldError={fieldError} />
      </TabPanel>

      {/* Hidden inputs are rendered outside the active TabPanel so they
       * always submit, regardless of which tab is currently open.
       */}
      {rules
        .filter((r) => ruleState[r.id]?.enabled === false)
        .map((r) => (
          <input key={`disabled-${r.id}`} type="hidden" name="disabledRuleIds" value={r.id} />
        ))}
      {rules
        .filter((r) => ruleState[r.id]?.override)
        .map((r) => (
          <input
            key={`override-${r.id}`}
            type="hidden"
            name="severityOverrides"
            value={`${r.id}=${ruleState[r.id]?.override}`}
          />
        ))}

      {state?.error ? (
        <p
          data-testid="project-form-error"
          className="rounded-md border border-[#ef4444] bg-[rgba(239,68,68,0.06)] px-3 py-2 text-xs text-[#ef4444]"
        >
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p
          data-testid="project-form-saved"
          className="rounded-md border border-[#10b981] bg-[rgba(16,185,129,0.06)] px-3 py-2 text-xs text-[#10b981]"
        >
          Saved.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        data-testid="project-submit"
        className="mt-2 self-end rounded-md bg-[#10b981] px-5 py-2 text-sm font-semibold text-[#0b0e14] hover:bg-[#f97316] disabled:opacity-50"
      >
        {pending ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}

function TabPanel({
  id,
  current,
  children,
}: {
  id: TabId;
  current: TabId;
  children: ReactNode;
}): ReactElement {
  return (
    <section
      data-testid={`panel-${id}`}
      data-tab-panel={id}
      hidden={current !== id}
      className="flex flex-col gap-4"
    >
      {children}
    </section>
  );
}

function RulesSection({
  rules,
  ruleState,
  onSetEnabled,
  onSetOverride,
}: {
  rules: RuleOption[];
  ruleState: Record<string, RuleState>;
  onSetEnabled: (id: string, on: boolean) => void;
  onSetOverride: (id: string, sev: Severity | '') => void;
}): ReactElement {
  return (
    <section data-testid="project-rules" className="flex flex-col gap-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#10b981]">Rules</h3>
        <span className="text-[10px] text-[#6b7280]">
          {rules.length} rule{rules.length === 1 ? '' : 's'} in the active pack. Update via{' '}
          <code className="text-[#10b981]">audithex update</code>.
        </span>
      </header>
      <p className="text-[10px] leading-relaxed text-[#6b7280]">
        <strong className="text-[#d4d4d4]">Every rule runs on this project by default.</strong>{' '}
        Untick to skip a rule for this project (it still exists in the pack for others). The
        Override column bumps a rule up or down for this project only — the pack document is never
        mutated.
      </p>
      <div className="overflow-x-auto rounded-md border border-[#1f242d]">
        <table className="min-w-full divide-y divide-[#1f242d] text-xs">
          <thead className="bg-[#0b0e14] text-[#6b7280]">
            <tr>
              <Th>Enabled</Th>
              <Th>Id</Th>
              <Th>Title</Th>
              <Th>Default</Th>
              <Th>Override</Th>
              <Th>OWASP</Th>
              <Th>CWE</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1f242d]">
            {rules.map((rule) => {
              const s = ruleState[rule.id] ?? { enabled: true, override: '' };
              return (
                <tr
                  key={rule.id}
                  data-testid="rule-row"
                  data-rule-id={rule.id}
                  className={s.enabled ? undefined : 'opacity-50'}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={s.enabled}
                      onChange={(e) => onSetEnabled(rule.id, e.target.checked)}
                      data-testid="rule-enabled"
                      className="h-4 w-4 cursor-pointer accent-[#10b981]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/rules/${rule.id}`}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="rule-link"
                      className="font-mono text-[#10b981] hover:text-[#f97316]"
                    >
                      {rule.id}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-[#d4d4d4]">{rule.title}</td>
                  <td className="px-3 py-2">
                    <SeverityTag severity={rule.defaultSeverity} />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={s.override}
                      onChange={(e) => onSetOverride(rule.id, e.target.value as Severity | '')}
                      data-testid="rule-override"
                      className="rounded border border-[#1f242d] bg-[#0b0e14] px-2 py-1 text-[11px] text-[#d4d4d4] focus:border-[#10b981] focus:outline-none"
                    >
                      <option value="">— default —</option>
                      {SEVERITIES.map((sev) => (
                        <option key={sev} value={sev}>
                          {sev}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-[#6b7280]">{rule.owasp.join(', ') || '—'}</td>
                  <td className="px-3 py-2 text-[#6b7280]">{rule.cwe ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DatabaseSection({
  initial,
  fieldError,
}: {
  initial?: ProjectView | null;
  fieldError: (key: string) => string | undefined;
}): ReactElement {
  return (
    <section
      data-testid="project-db"
      className="flex flex-col gap-3 rounded-md border border-[#1f242d] bg-[#0b0e14] p-4"
    >
      <header>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#10b981]">
          Database (optional)
        </h3>
        <p className="mt-1 text-[10px] text-[#6b7280]">
          Connects to the project's RAG / operational database and runs the same secret-pattern
          rules against text-typed columns or document fields. Supported drivers:{' '}
          <strong className="text-[#d4d4d4]">postgres</strong> (tables) and{' '}
          <strong className="text-[#d4d4d4]">mongodb</strong> (collections). Local instances only.
          Leave the driver blank to skip the database scan. "Scan all tables / collections" is
          opt-in only — walking every table on every scan is overhead and usually not what you want.
        </p>
      </header>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[#6b7280]">Driver</span>
        <select
          name="dbDriver"
          defaultValue={initial?.dbConnection?.driver ?? ''}
          data-testid="project-db-driver"
          className="rounded-md border border-[#1f242d] bg-[#0b0e14] px-3 py-2 text-sm focus:border-[#10b981] focus:outline-none"
        >
          <option value="">— none —</option>
          <option value="postgres">postgres</option>
          <option value="mongodb">mongodb</option>
        </select>
        {fieldError('dbDriver') ? (
          <span className="text-xs text-[#ef4444]">{fieldError('dbDriver')}</span>
        ) : null}
      </label>
      <Field
        name="dbUri"
        label="Connection URI (postgres://… or mongodb://…)"
        defaultValue={initial?.dbConnection?.uri ?? ''}
        testid="project-db-uri"
        error={fieldError('dbUri')}
      />
      <Field
        name="dbDatabase"
        label="Database name (optional override; falls back to the URI's path)"
        defaultValue={initial?.dbConnection?.database ?? ''}
        testid="project-db-database"
        error={fieldError('dbDatabase')}
      />
      <Field
        name="dbTables"
        label="Tables / collections (comma- or space-separated, e.g. public.documents, conversations)"
        defaultValue={(initial?.dbTables ?? []).join(', ')}
        testid="project-db-tables"
        error={fieldError('dbTables')}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="dbScanAllTables"
          defaultChecked={initial?.dbScanAllTables ?? false}
          data-testid="project-db-scan-all"
          className="h-4 w-4 cursor-pointer accent-[#10b981]"
        />
        <span className="text-[#d4d4d4]">
          Scan all tables / collections when the list above is empty
          <span className="ml-2 text-[10px] text-[#6b7280]">
            (opt-in — leave off unless you really mean every one of them)
          </span>
        </span>
      </label>
    </section>
  );
}

function Field({
  name,
  label,
  defaultValue,
  required,
  testid,
  error,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  testid: string;
  error?: string;
}): ReactElement {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-[#6b7280]">{label}</span>
      <input
        name={name}
        type="text"
        required={required}
        defaultValue={defaultValue}
        data-testid={testid}
        className="rounded-md border border-[#1f242d] bg-[#0b0e14] px-3 py-2 text-sm focus:border-[#10b981] focus:outline-none"
      />
      {error ? <span className="text-xs text-[#ef4444]">{error}</span> : null}
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">
      {children}
    </th>
  );
}

const SEVERITY_BG: Record<Severity, string> = {
  critical: 'bg-[#7f1d1d] text-[#fecaca]',
  high: 'bg-[#9a3412] text-[#fed7aa]',
  medium: 'bg-[#854d0e] text-[#fde68a]',
  low: 'bg-[#1e3a8a] text-[#bfdbfe]',
};

function SeverityTag({ severity }: { severity: Severity }): ReactElement {
  return (
    <span
      className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_BG[severity]}`}
    >
      {severity}
    </span>
  );
}

const OWASP_GROUPS: { id: string; title: string; requiresAiKey: boolean }[] = [
  { id: 'LLM01', title: 'Prompt Injection', requiresAiKey: false },
  { id: 'LLM02', title: 'Sensitive Information Disclosure', requiresAiKey: false },
  { id: 'LLM03', title: 'Supply Chain', requiresAiKey: false },
  { id: 'LLM04', title: 'Data and Model Poisoning (future)', requiresAiKey: false },
  { id: 'LLM05', title: 'Improper Output Handling', requiresAiKey: false },
  { id: 'LLM06', title: 'Excessive Agency', requiresAiKey: false },
  { id: 'LLM07', title: 'System Prompt Leakage', requiresAiKey: false },
  { id: 'LLM08', title: 'Vector and Embedding Weaknesses (future)', requiresAiKey: false },
  { id: 'LLM09', title: 'Misinformation (future, AI-eval based)', requiresAiKey: true },
  { id: 'LLM10', title: 'Unbounded Consumption', requiresAiKey: false },
];

const KNOWN_LANGUAGES = [
  'typescript',
  'javascript',
  'python',
  'php',
  'go',
  'java',
  'ruby',
  'plain-text',
];

function ScanScopeSection({
  initial,
  groupEnabled,
  onToggleGroup,
}: {
  initial?: ProjectView | null;
  groupEnabled: Record<string, boolean>;
  onToggleGroup: (id: string, on: boolean) => void;
}): ReactElement {
  return (
    <section
      data-testid="project-scope"
      className="flex flex-col gap-3 rounded-md border border-[#1f242d] bg-[#0b0e14] p-4"
    >
      <header>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#10b981]">Scan scope</h3>
        <p className="mt-1 text-[10px] text-[#6b7280]">
          Coarse-grained control over what the scanner runs. Use these for the obvious on/off
          toggles; drill into the per-rule table under <strong>Rules</strong> only if you need to
          flip a single rule inside an enabled group.
        </p>
      </header>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[11px] font-semibold uppercase tracking-wide text-[#d4d4d4]">
          OWASP LLM Top 10 (2025) groups
        </legend>
        <p className="text-[10px] text-[#6b7280]">
          Tick = include that category in the scan. All 10 are on by default. Groups marked{' '}
          <span className="font-semibold text-[#fecaca]">AI key</span> need an LLM to evaluate
          (configure it on{' '}
          <a className="text-[#10b981] underline" href="/settings/ai">
            /settings/ai
          </a>
          ); skipping AI groups is fine if you only want static checks.
        </p>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {OWASP_GROUPS.map((g) => {
            const checked = groupEnabled[g.id] ?? true;
            return (
              <label
                key={g.id}
                className="flex items-center gap-2 text-[11px] text-[#d4d4d4]"
                data-testid="scope-group"
                data-group-id={g.id}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onToggleGroup(g.id, e.target.checked)}
                  name={`group_${g.id}`}
                  value="on"
                  data-testid="scope-group-checkbox"
                  className="h-4 w-4 cursor-pointer accent-[#10b981]"
                />
                <span className="font-mono text-[#10b981]">{g.id}</span>
                <span className="text-[#d4d4d4]">{g.title}</span>
                {g.requiresAiKey ? (
                  <span className="ml-1 rounded bg-[#1e3a8a] px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#bfdbfe]">
                    AI key
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      <Field
        name="languages"
        label={`Languages to scan (comma-separated; blank = all). Known: ${KNOWN_LANGUAGES.join(', ')}`}
        defaultValue={(initial?.languages ?? []).join(', ')}
        testid="scope-languages"
        error={undefined}
      />
      <Field
        name="extraExtensions"
        label="Extra file extensions to scan (comma-separated, e.g. .tf, .yml, .lua)"
        defaultValue={(initial?.extraExtensions ?? []).join(', ')}
        testid="scope-extensions"
        error={undefined}
      />
      <p className="text-[10px] text-[#6b7280]">
        Note: server-side filtering of <code>languages</code> + <code>extraExtensions</code> ships
        in the next slice; today these fields persist on the project record but the discovery layer
        still walks every file type until that hook lands.
      </p>
    </section>
  );
}
