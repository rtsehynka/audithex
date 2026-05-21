import type { SerializableFinding } from './queries';

/**
 * Identity key for finding equality across two scans. Matches the
 * key the eval-runner uses for fixture comparisons (ruleId + file +
 * line), so a finding either gained, lost, or kept severity classes
 * deterministically.
 */
export function findingKey(f: SerializableFinding): string {
  if (f.kind === 'dynamic') {
    return `${f.ruleId}|dyn|${f.payloadId}`;
  }
  return `${f.ruleId}|${f.file}|${f.line}`;
}

export interface ScanDiff {
  added: SerializableFinding[];
  removed: SerializableFinding[];
  unchanged: SerializableFinding[];
}

export interface ScanDiffSummary {
  totals: { added: number; removed: number; unchanged: number };
  bySeverity: Record<SerializableFinding['severity'], number>;
}

export function diffScans(
  baseline: readonly SerializableFinding[],
  candidate: readonly SerializableFinding[],
): ScanDiff {
  const baseKeys = new Map<string, SerializableFinding>();
  for (const f of baseline) baseKeys.set(findingKey(f), f);
  const candKeys = new Map<string, SerializableFinding>();
  for (const f of candidate) candKeys.set(findingKey(f), f);

  const added: SerializableFinding[] = [];
  const unchanged: SerializableFinding[] = [];
  for (const [key, finding] of candKeys) {
    if (baseKeys.has(key)) unchanged.push(finding);
    else added.push(finding);
  }
  const removed: SerializableFinding[] = [];
  for (const [key, finding] of baseKeys) {
    if (!candKeys.has(key)) removed.push(finding);
  }
  return { added, removed, unchanged };
}

export function summariseDiff(diff: ScanDiff): ScanDiffSummary {
  const bySeverity: ScanDiffSummary['bySeverity'] = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const f of diff.added) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
  }
  return {
    totals: {
      added: diff.added.length,
      removed: diff.removed.length,
      unchanged: diff.unchanged.length,
    },
    bySeverity,
  };
}
