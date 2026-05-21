import { join } from 'node:path';
import { initI18n, t } from '@audithex/core-i18n';
import { loadRulesPack } from '@audithex/core-rules';
import type { RuleDocument, Severity } from '@audithex/core-types';
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

let cache: RuleOption[] | null = null;
let i18nReady: Promise<unknown> | null = null;

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
  if (cache) return cache;
  if (!i18nReady) i18nReady = initI18n();
  await i18nReady;

  const userRulesPackDir = join(audithexHome(), 'rules-pack', 'current');
  const pack = loadRulesPack({ userRulesPackDir });
  const options: RuleOption[] = pack.rules
    .filter((r: RuleDocument) => r.enabled !== false)
    .map((r: RuleDocument) => ({
      id: r._id,
      title: titleFor(r._id),
      defaultSeverity: r.severity,
      owasp: [...r.owasp],
      cwe: r.cwe ?? null,
      engine: r.engine,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  cache = options;
  return options;
}

function titleFor(id: string): string {
  const key = `findings:${id}.title`;
  const v = t(key);
  return v === key ? id : v;
}
