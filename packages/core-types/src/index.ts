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
  artifacts: DiscoveryArtifact[];
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
