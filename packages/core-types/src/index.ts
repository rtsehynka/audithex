export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type OwaspLLMCategory =
  | 'LLM01'
  | 'LLM02'
  | 'LLM03'
  | 'LLM04'
  | 'LLM05'
  | 'LLM06'
  | 'LLM07'
  | 'LLM08'
  | 'LLM09'
  | 'LLM10';

export type Locale = 'en' | 'uk';

// Artifact taxonomy.
// `detail` shape conventions per kind are documented in the discovery
// extractor that emits them. Intentionally loose to keep things lightweight.
export type ArtifactKind =
  | 'sdk-import'
  | 'llm-call-site'
  | 'model-string'
  | 'system-prompt'
  | 'tool-definition'
  | 'rag-config'
  | 'secret-candidate';

export type SourceConfidence = 'ast' | 'regex';

export interface SourceLocation {
  file: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

export interface DiscoveryArtifact {
  kind: ArtifactKind;
  confidence: SourceConfidence;
  location: SourceLocation;
  detail: Record<string, unknown>;
}

export interface DiscoverySummary {
  totalFiles: number;
  byExtension: Record<string, number>;
  envFiles: number;
  skippedByGitignore: number;
  elapsedMs: number;
}

export interface DiscoveryResult {
  rootPath: string;
  scannedAt: string;
  summary: DiscoverySummary;
  files: string[];
  artifacts: DiscoveryArtifact[];
}

export interface CodeSnippet {
  /** 1-based line number of the first line in `lines`. */
  startLine: number;
  /** Raw source lines around the finding (typically ±3 lines of context). */
  lines: string[];
  /** 1-based line number that triggered the finding — for highlighting. */
  focusLine: number;
}

/**
 * Audithex distinguishes two kinds of scan and therefore two kinds of
 * Finding. A static finding always points at `file:line`. A dynamic
 * finding has no source location — it captures a live-LLM
 * attack/response pair plus the judge's verdict.
 *
 * The `kind` discriminator forces every consumer (renderers, persisters,
 * the eval runner, the web mapper) to handle both branches explicitly.
 */
export type ScanKind = 'static' | 'dynamic';

export type PayloadCategory =
  | 'prompt_injection_direct'
  | 'prompt_injection_indirect'
  | 'jailbreak_roleplay'
  | 'system_prompt_leak'
  | 'tool_misuse'
  | 'data_exfiltration'
  | 'xss_in_output'
  | 'pii_extraction'
  | 'dos_token_flood'
  | 'multi_shot_jailbreak';

export type PayloadJudgeType = 'regex' | 'refusal' | 'llm';

interface FindingBase {
  ruleId: string;
  severity: Severity;
  owasp: OwaspLLMCategory[];
  cwe?: string;
  /** ID of the block the rule belongs to, denormalised onto every finding. */
  blockId: string;
  messageKey: string;
  messageParams?: Record<string, string | number>;
  /** Why this is a security problem — i18n key, populated for every finding. */
  rationaleKey: string;
  rationaleParams?: Record<string, string | number>;
  fixKey: string;
  fixParams?: Record<string, string | number>;
}

export interface StaticFinding extends FindingBase {
  kind: 'static';
  location: SourceLocation;
  /**
   * Source context around the finding. Populated by the engine when
   * the file is readable; DB-scan findings emit no snippet since the
   * "file" is a synthetic row pointer.
   */
  codeSnippet?: CodeSnippet;
}

export interface DynamicFinding extends FindingBase {
  kind: 'dynamic';
  /** The DT rule id that produced this finding (e.g. "DT001"). */
  payloadId: string;
  payloadCategory: PayloadCategory;
  /** Prompt sent to the user's agent. Capped to 2 KB + secret-scrubbed before persist. */
  prompt: string;
  /** Response received from the user's agent. Same 2 KB cap + scrub. */
  response: string;
  /** Human-readable explanation from the judge of why this is a failure. */
  judgeReason: string;
  tokensUsed?: { input: number; output: number };
  costUsd?: number;
}

export type Finding = StaticFinding | DynamicFinding;

export interface ScanResult {
  rootPath: string;
  scannedAt: string;
  discovery: DiscoverySummary;
  findings: Finding[];
  rulesVersion: string;
  audithexVersion: string;
  elapsedMs: number;
}

export interface RuleDefinition {
  id: string;
  severity: Severity;
  owasp: OwaspLLMCategory[];
  cwe?: string;
}

export interface Rule extends RuleDefinition {
  check: (discovery: DiscoveryResult) => Finding[];
}

/**
 * Data-driven rule document. Each rule ships as a plain JSON document
 * shaped like a Mongoose model so the same payload moves untouched
 * between the bundled CLI rules-pack, `~/.audithex/rules-pack/` after
 * `audithex update`, and the Phase 2 MongoDB store.
 *
 * The `engine` field selects the evaluator; `params` is the engine's
 * input contract. Engines and their param shapes live in
 * `@audithex/core-rules`.
 */
export type RuleEngineKind =
  | 'regex-in-code'
  | 'regex-in-prompt'
  | 'artifact-property'
  | 'artifact-presence'
  | 'dynamic-attack';

export interface RuleDocument {
  _id: string;
  schemaVersion: '0.1';
  severity: Severity;
  owasp: OwaspLLMCategory[];
  cwe?: string;
  engine: RuleEngineKind;
  params: Record<string, unknown>;
  messageKey: string;
  /** Why this is a security problem — populated for every shipped rule. */
  rationaleKey: string;
  fixKey: string;
  /** Block the rule belongs to (e.g. "block:secrets"). Validated against the pack's block list at load time. */
  block: string;
  /** When provided, restricts the rule to artifacts/files of these languages by id. */
  languages?: string[];
  /** Defaults to true when absent. */
  enabled?: boolean;
  /** Free-form metadata: references, authors, history. */
  meta?: Record<string, unknown>;
}

/**
 * A coherent group of rules with a single on/off toggle on every
 * project. Disabled block → every rule in it is skipped before the
 * engine even sees it. Enabled block → rules run through whichever
 * runner matches their `engine` (static `runRules` or async
 * `runDynamicAttackRules`).
 *
 * Each block carries i18n keys for name, description, and rationale —
 * so the UI can explain to the user *why* this whole category of
 * problem matters, not just what each individual rule checks.
 */
export interface BlockDocument {
  _id: string;
  schemaVersion: '0.1';
  scanKind: ScanKind;
  nameKey: string;
  descriptionKey: string;
  rationaleKey: string;
  /** false for opt-in blocks (e.g. dynamic-self-attack — paid, network calls). */
  defaultEnabled: boolean;
  owaspMapping?: readonly OwaspLLMCategory[];
  /** Single source of truth for rule ↔ block ownership; cross-checked against rule.block at load. */
  ruleIds: readonly string[];
}

/**
 * Reusable pattern bundle referenced by one or more rule documents.
 * Modelled after the TruffleHog detector layout (id + regex + provider
 * + reference) so existing public databases can be imported with a
 * simple field rename.
 */
export interface SecretPatternEntry {
  id: string;
  provider: string;
  description: string;
  regex: string;
  references?: string[];
  tags?: string[];
}

export interface PatternBundle {
  _id: string;
  schemaVersion: '0.1';
  kind: 'secret-patterns' | 'code-patterns';
  source: string;
  license?: string;
  entries: SecretPatternEntry[];
}

export interface RulesPackManifest {
  _id: string;
  schemaVersion: '0.1';
  version: string;
  releasedAt: string;
  ruleIds: string[];
  patternBundleIds: string[];
  /**
   * IDs of every block document the pack ships. Loaded from
   * `<pack>/blocks/<id>.json`. Defaults to an empty array for legacy
   * packs that predate the block model — the loader synthesises a
   * single "block:legacy" so the runner code never has to special-case
   * the absent state.
   */
  blockIds?: string[];
  /** Hex-encoded sha256 of the manifest payload, set by the publisher. */
  checksumSha256?: string;
}

export interface RulesPack {
  manifest: RulesPackManifest;
  rules: RuleDocument[];
  patternBundles: PatternBundle[];
  /** Block documents loaded from `<pack>/blocks/`. */
  blocks: BlockDocument[];
  /** Where the pack was loaded from: bundled (ships with CLI) or user (~/.audithex). */
  source: 'bundled' | 'user';
  rootPath: string;
}

export type ExitCode = 0 | 1 | 2;

export function exitCodeFromFindings(findings: readonly Finding[]): ExitCode {
  if (findings.length === 0) {
    return 0;
  }
  for (const f of findings) {
    if (f.severity === 'critical' || f.severity === 'high') {
      return 2;
    }
  }
  return 1;
}
