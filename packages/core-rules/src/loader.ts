import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  BlockDocument,
  PatternBundle,
  RuleDocument,
  RulesPack,
  RulesPackManifest,
} from '@audithex/core-types';

/**
 * Locates the bundled rules-pack directory next to the package source.
 * Works both in development (dist/ next to src/) and in published
 * builds where `rules-pack/` is listed in package.json `files`.
 */
function resolveBundledRulesPackRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    const candidate = resolve(current, 'rules-pack');
    try {
      if (statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      // walk up
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error('Audithex bundled rules-pack directory not found.');
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function listJsonFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.filter((name) => name.endsWith('.json')).sort();
}

/**
 * The legacy block synthesised for rule packs that predate the block
 * model. Any rule loaded without a `block` field is reassigned here so
 * the runner code never has to special-case a missing block. We do not
 * persist this synthetic block — it lives only in memory.
 */
const LEGACY_BLOCK_ID = 'block:legacy';

function synthesiseLegacyBlock(ruleIds: readonly string[]): BlockDocument {
  return {
    _id: LEGACY_BLOCK_ID,
    schemaVersion: '0.1',
    scanKind: 'static',
    nameKey: 'blocks:legacy.name',
    descriptionKey: 'blocks:legacy.description',
    rationaleKey: 'blocks:legacy.rationale',
    defaultEnabled: true,
    ruleIds,
  };
}

function validatePack(rules: RuleDocument[], blocks: BlockDocument[]): void {
  const blockById = new Map(blocks.map((b) => [b._id, b]));
  const ruleIds = new Set(rules.map((r) => r._id));

  for (const rule of rules) {
    if (!rule.block) continue; // legacy rules are reassigned by the loader before this check
    if (!blockById.has(rule.block)) {
      throw new Error(
        `Rules-pack invalid: rule ${rule._id} references unknown block "${rule.block}".`,
      );
    }
  }
  for (const block of blocks) {
    for (const rId of block.ruleIds) {
      if (!ruleIds.has(rId)) {
        throw new Error(
          `Rules-pack invalid: block ${block._id} lists rule "${rId}" that does not exist.`,
        );
      }
    }
  }
}

function readPack(rootPath: string, source: 'bundled' | 'user'): RulesPack {
  const manifest = readJson<RulesPackManifest>(join(rootPath, 'manifest.json'));

  const rulesDir = join(rootPath, 'rules');
  const rules: RuleDocument[] = [];
  for (const file of listJsonFiles(rulesDir)) {
    rules.push(readJson<RuleDocument>(join(rulesDir, file)));
  }

  const patternsDir = join(rootPath, 'patterns');
  const patternBundles: PatternBundle[] = [];
  for (const file of listJsonFiles(patternsDir)) {
    patternBundles.push(readJson<PatternBundle>(join(patternsDir, file)));
  }

  const blocksDir = join(rootPath, 'blocks');
  const blocks: BlockDocument[] = [];
  for (const file of listJsonFiles(blocksDir)) {
    blocks.push(readJson<BlockDocument>(join(blocksDir, file)));
  }

  // Backwards-compat: if a pack ships no blocks at all, synthesise the
  // legacy block and route every rule through it. This keeps older
  // packs scanned via `audithex update` working until the next pack
  // release that ships the new schema.
  if (blocks.length === 0) {
    const legacy = synthesiseLegacyBlock(rules.map((r) => r._id));
    blocks.push(legacy);
    for (const rule of rules) {
      if (!rule.block) rule.block = LEGACY_BLOCK_ID;
    }
  } else {
    // Any rule that arrives without a `block` field is also routed to
    // the legacy block on a per-rule basis (mixed-pack scenario).
    const hasLegacy = blocks.some((b) => b._id === LEGACY_BLOCK_ID);
    const stragglers = rules.filter((r) => !r.block);
    if (stragglers.length > 0 && !hasLegacy) {
      blocks.push(synthesiseLegacyBlock(stragglers.map((r) => r._id)));
    }
    for (const rule of stragglers) {
      rule.block = LEGACY_BLOCK_ID;
    }
  }

  validatePack(rules, blocks);

  return {
    manifest,
    rules,
    patternBundles,
    blocks,
    source,
    rootPath,
  };
}

export interface LoadRulesPackOptions {
  /** When set, overrides the user override directory (`~/.audithex/rules-pack/current/`). */
  userRulesPackDir?: string;
  /** Force loading the bundled pack regardless of user dir presence. */
  preferBundled?: boolean;
}

export function bundledRulesPackPath(): string {
  return resolveBundledRulesPackRoot();
}

export function loadBundledRulesPack(): RulesPack {
  return readPack(resolveBundledRulesPackRoot(), 'bundled');
}

export function loadRulesPack(options: LoadRulesPackOptions = {}): RulesPack {
  if (!options.preferBundled && options.userRulesPackDir) {
    try {
      const stat = statSync(join(options.userRulesPackDir, 'manifest.json'));
      if (stat.isFile()) {
        return readPack(options.userRulesPackDir, 'user');
      }
    } catch {
      // fall through to bundled
    }
  }
  return loadBundledRulesPack();
}
