import type { ArtifactKind, DiscoveryArtifact, Finding, RuleDocument } from '@audithex/core-types';
import type { EngineContext, RuleEngine } from './types.js';

interface ArtifactPropertyParams {
  artifactKind: ArtifactKind;
  predicate: {
    field: string;
    equals?: unknown;
    notEquals?: unknown;
    in?: unknown[];
    matches?: string;
  };
}

/**
 * Engine that walks `discovery.artifacts`, picks the requested kind,
 * and emits a finding for every artifact whose nested `field` (dotted
 * path against the artifact object — including `detail.*`) satisfies
 * the predicate.
 */
export const artifactPropertyEngine: RuleEngine = {
  kind: 'artifact-property',
  evaluate(rule: RuleDocument, ctx: EngineContext): Finding[] {
    const params = rule.params as unknown as ArtifactPropertyParams;
    if (!params.artifactKind || !params.predicate) return [];
    const findings: Finding[] = [];
    const matchRegex = params.predicate.matches ? safeRegex(params.predicate.matches) : null;

    for (const artifact of ctx.discovery.artifacts) {
      if (artifact.kind !== params.artifactKind) continue;
      const value = getByPath(artifact, params.predicate.field);
      if (!predicateMatches(value, params.predicate, matchRegex)) continue;
      findings.push({
        ruleId: rule._id,
        severity: rule.severity,
        owasp: rule.owasp,
        ...(rule.cwe ? { cwe: rule.cwe } : {}),
        location: artifact.location,
        messageKey: rule.messageKey,
        messageParams: extractMessageParams(artifact),
        fixKey: rule.fixKey,
      });
    }
    return findings;
  },
};

function extractMessageParams(artifact: DiscoveryArtifact): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  // Hoist a few well-known fields so i18n templates can reference them
  // without having to know about Discovery internals.
  const candidates: readonly string[] = [
    'toolName',
    'framework',
    'provider',
    'modelId',
    'system',
    'embeddingModel',
    'language',
  ];
  for (const key of candidates) {
    const v = artifact.detail[key];
    if (typeof v === 'string' || typeof v === 'number') {
      params[key] = v;
    }
  }
  return params;
}

function predicateMatches(
  value: unknown,
  predicate: ArtifactPropertyParams['predicate'],
  matchRegex: RegExp | null,
): boolean {
  if (predicate.equals !== undefined) {
    return value === predicate.equals;
  }
  if (predicate.notEquals !== undefined) {
    return value !== predicate.notEquals;
  }
  if (predicate.in !== undefined) {
    return predicate.in.includes(value);
  }
  if (matchRegex && typeof value === 'string') {
    return matchRegex.test(value);
  }
  return false;
}

function getByPath(obj: DiscoveryArtifact, path: string): unknown {
  const parts = path.split('.');
  let cursor: unknown = obj;
  for (const part of parts) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function safeRegex(source: string): RegExp | null {
  try {
    return new RegExp(source);
  } catch {
    return null;
  }
}
