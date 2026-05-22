import type { RuleOption } from './rules';
import { listAvailableRules } from './rules';

/**
 * Authoritative list of OWASP LLM Top 10 (2025) categories, in spec
 * order. Each row carries a static `status` describing whether
 * Audithex aims to cover that category through static code rules at
 * all — `static` rules cover the lintable cases; `dynamic` would
 * require the (future) live-LLM attack runner; `out-of-scope`
 * categories (LLM04) are training-data concerns that no static
 * scanner can lint.
 */
export interface CoverageCategory {
  id: string;
  /** i18n key under `findings:owasp.<id>` for the human-readable label. */
  labelKey: string;
  status: 'static' | 'dynamic' | 'out-of-scope';
  /** Short explanation of why this status — surfaced in the UI. */
  note: string;
}

const CATEGORIES: CoverageCategory[] = [
  {
    id: 'LLM01',
    labelKey: 'owasp.LLM01',
    status: 'static',
    note: 'Detects raw user input interpolated directly into prompt templates without boundary tags.',
  },
  {
    id: 'LLM02',
    labelKey: 'owasp.LLM02',
    status: 'static',
    note: 'Detects provider secrets in source, SQL built by string concatenation, innerHTML of LLM output.',
  },
  {
    id: 'LLM03',
    labelKey: 'owasp.LLM03',
    status: 'static',
    note: 'Detects unsafe deserialisation (pickle / torch.load) and known typosquatted package names in lockfiles.',
  },
  {
    id: 'LLM04',
    labelKey: 'owasp.LLM04',
    status: 'out-of-scope',
    note: 'Training-data and model poisoning. Not lintable from source — requires a data-pipeline scanner.',
  },
  {
    id: 'LLM05',
    labelKey: 'owasp.LLM05',
    status: 'static',
    note: 'Detects eval/Function/exec, file-write, shell, SSRF and missing max_tokens caps on LLM calls.',
  },
  {
    id: 'LLM06',
    labelKey: 'owasp.LLM06',
    status: 'static',
    note: 'Detects tool definitions missing description/parameters and destructive-verb tools without an approval gate.',
  },
  {
    id: 'LLM07',
    labelKey: 'owasp.LLM07',
    status: 'static',
    note: 'Detects secrets hardcoded inside system prompts and system prompts carrying credential-shaped values.',
  },
  {
    id: 'LLM08',
    labelKey: 'owasp.LLM08',
    status: 'dynamic',
    note: 'Vector / embedding weaknesses. Phase B will add per-tenant index checks and public-endpoint detection.',
  },
  {
    id: 'LLM09',
    labelKey: 'owasp.LLM09',
    status: 'dynamic',
    note: 'Misinformation. Phase B will add disclaimer-marker checks; full evaluation needs the AI-judge engine.',
  },
  {
    id: 'LLM10',
    labelKey: 'owasp.LLM10',
    status: 'static',
    note: 'Detects unbounded LLM calls (missing max_tokens); future rules will cover agent loops and rate limits.',
  },
];

export interface CoverageRow {
  category: CoverageCategory;
  rules: RuleOption[];
}

/**
 * Returns one row per OWASP category with the rules currently mapped
 * to it through `owasp[]`. Reads from the same in-memory rules cache
 * `/rules` and `/projects/*` use, so the matrix always reflects what
 * the running scanner would actually fire.
 */
export async function buildCoverageMatrix(): Promise<CoverageRow[]> {
  const rules = await listAvailableRules();
  return CATEGORIES.map((category) => ({
    category,
    rules: rules.filter((r) => r.owasp.includes(category.id)),
  }));
}

export function totalCategories(): number {
  return CATEGORIES.length;
}
