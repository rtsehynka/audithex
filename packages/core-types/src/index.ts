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

export interface Finding {
  ruleId: string;
  severity: Severity;
  owasp: OwaspLLMCategory[];
  location: SourceLocation;
  messageKey: string;
  messageParams?: Record<string, string | number>;
  fixKey: string;
  fixParams?: Record<string, string | number>;
  cwe?: string;
  /**
   * Source context around the finding. Populated by the engine when
   * the file is readable; DB-scan findings emit an empty array since
   * the "file" is a synthetic row pointer.
   */
  codeSnippet?: CodeSnippet;
}

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
  | 'artifact-presence';

export interface RuleDocument {
  _id: string;
  schemaVersion: '0.1';
  severity: Severity;
  owasp: OwaspLLMCategory[];
  cwe?: string;
  engine: RuleEngineKind;
  params: Record<string, unknown>;
  messageKey: string;
  fixKey: string;
  /** When provided, restricts the rule to artifacts/files of these languages by id. */
  languages?: string[];
  /** Defaults to true when absent. */
  enabled?: boolean;
  /** Free-form metadata: references, authors, history. */
  meta?: Record<string, unknown>;
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
  /** Hex-encoded sha256 of the manifest payload, set by the publisher. */
  checksumSha256?: string;
}

export interface RulesPack {
  manifest: RulesPackManifest;
  rules: RuleDocument[];
  patternBundles: PatternBundle[];
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
