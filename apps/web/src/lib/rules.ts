import { join } from 'node:path';
import { initI18n, t } from '@audithex/core-i18n';
import { loadRulesPack } from '@audithex/core-rules';
import type { RuleDocument, RulesPack, Severity } from '@audithex/core-types';
import { audithexHome } from '@audithex/core-update';

/**
 * Plain-object projection of one rule for the web form. We never hand
 * the raw RuleDocument to a client component — strip everything React
 * cannot serialise (function-valued meta, deep maps from the engine).
 */
export interface RuleOption {
  id: string;
  title: string;
  defaultSeverity: Severity;
  owasp: string[];
  cwe: string | null;
  engine: string;
}

/**
 * Detail-page projection of one rule. Carries everything `/rules/[id]`
 * needs to render — message + fix templates from i18n, the engine's
 * input contract (params), language scope, and free-form meta.
 */
export interface RuleDetail extends RuleOption {
  messageTemplate: string;
  fixTemplate: string;
  params: Record<string, unknown>;
  languages: string[];
  meta: Record<string, unknown>;
  rulesPackVersion: string;
  rulesPackSource: string;
}

let listCache: RuleOption[] | null = null;
let detailCache: Map<string, RuleDetail> | null = null;
let i18nReady: Promise<unknown> | null = null;
let packCache: RulesPack | null = null;

/**
 * Returns every rule that ships in the active rules pack (bundled +
 * any user-installed pack under `~/.audithex/rules-pack/current/`).
 * Memoised for the lifetime of the Node process so flipping between
 * /projects/new and /projects/[id] does not re-read the JSON files.
 *
 * The rules pack itself is updated via `audithex update`, which
 * pulls from the configured git channel — that is how new rules
 * land in the UI without code changes.
 */
export async function listAvailableRules(): Promise<RuleOption[]> {
  if (listCache) return listCache;
  await loadAll();
  // loadAll() populates listCache.
  return listCache ?? [];
}

export async function getRuleDetail(id: string): Promise<RuleDetail | null> {
  if (!detailCache) await loadAll();
  return detailCache?.get(id) ?? null;
}

async function loadAll(): Promise<void> {
  if (!i18nReady) i18nReady = initI18n();
  await i18nReady;

  const userRulesPackDir = join(audithexHome(), 'rules-pack', 'current');
  const pack = loadRulesPack({ userRulesPackDir });
  packCache = pack;

  const enabledRules = pack.rules.filter((r: RuleDocument) => r.enabled !== false);
  const options: RuleOption[] = enabledRules
    .map((r: RuleDocument) => toOption(r))
    .sort((a, b) => a.id.localeCompare(b.id));

  const details = new Map<string, RuleDetail>();
  for (const r of enabledRules) {
    details.set(r._id, toDetail(r, pack));
  }

  listCache = options;
  detailCache = details;
}

function toOption(r: RuleDocument): RuleOption {
  return {
    id: r._id,
    title: titleFor(r._id),
    defaultSeverity: r.severity,
    owasp: [...r.owasp],
    cwe: r.cwe ?? null,
    engine: r.engine,
  };
}

function toDetail(r: RuleDocument, pack: RulesPack): RuleDetail {
  return {
    ...toOption(r),
    messageTemplate: templateFor(r._id, 'message'),
    fixTemplate: templateFor(r._id, 'fix'),
    params: cloneJson(r.params),
    languages: r.languages ? [...r.languages] : [],
    meta: r.meta ? cloneJson(r.meta) : {},
    rulesPackVersion: pack.manifest.version,
    rulesPackSource: pack.source,
  };
}

function titleFor(id: string): string {
  const key = `findings:${id}.title`;
  const v = t(key);
  return v === key ? id : v;
}

function templateFor(id: string, kind: 'message' | 'fix'): string {
  const key = `findings:${id}.${kind}`;
  const v = t(key);
  return v === key ? '' : v;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function packMeta(): { version: string; source: string } | null {
  if (!packCache) return null;
  return { version: packCache.manifest.version, source: packCache.source };
}
