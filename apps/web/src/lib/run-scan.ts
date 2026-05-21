import { join } from 'node:path';
import { discover } from '@audithex/core-discovery';
import { getProjectByName, saveScanRun } from '@audithex/core-persistence';
import { loadRulesPack, runRules } from '@audithex/core-rules';
import type { Finding, ScanResult } from '@audithex/core-types';
import { audithexHome } from '@audithex/core-update';
import { getConnection } from './db';
import { getProjectForUI } from './projects';

/**
 * Stream of structured events emitted by the live scan runner. The SSE
 * route handler serialises each event as `data: <json>\n\n`; the client
 * reads them through EventSource and prints a log + redirect-on-done.
 */
export type ScanRunEvent =
  | { type: 'start'; project: string; rootPath: string }
  | { type: 'discovery'; phase: 'begin' }
  | { type: 'discovery'; phase: 'end'; totalFiles: number; elapsedMs: number }
  | { type: 'rules'; phase: 'loaded'; version: string; source: string; total: number }
  | {
      type: 'rule';
      ruleId: string;
      findings: number;
      index: number;
      total: number;
    }
  | { type: 'persist'; phase: 'begin' }
  | { type: 'done'; scanId: string; totalFindings: number; elapsedMs: number }
  | { type: 'error'; message: string };

/**
 * Runs a scan for the given project, yielding ScanRunEvents as it goes.
 * The pipeline mirrors `apps/cli/src/commands/scan.ts` so behaviour is
 * identical to `audithex scan --project <name>`; the only difference is
 * that each phase emits a typed event the route handler can stream.
 */
export async function* runProjectScan(projectId: string): AsyncGenerator<ScanRunEvent> {
  const project = await getProjectForUI(projectId);
  if (!project) {
    yield { type: 'error', message: `Project not found: ${projectId}` };
    return;
  }
  yield { type: 'start', project: project.name, rootPath: project.rootPath };

  const startedAt = Date.now();

  yield { type: 'discovery', phase: 'begin' };
  const discoveryStartedAt = Date.now();
  const discovery = discover({ rootPath: project.rootPath });
  yield {
    type: 'discovery',
    phase: 'end',
    totalFiles: discovery.summary.totalFiles,
    elapsedMs: Date.now() - discoveryStartedAt,
  };

  const userRulesPackDir = join(audithexHome(), 'rules-pack', 'current');
  const pack = loadRulesPack({ userRulesPackDir });
  const eligible = pack.rules.filter(
    (r) => r.enabled !== false && !(project.disabledRuleIds ?? []).includes(r._id),
  );
  yield {
    type: 'rules',
    phase: 'loaded',
    version: pack.manifest.version,
    source: pack.source,
    total: eligible.length,
  };

  const collected: Finding[] = [];
  const events: ScanRunEvent[] = [];
  runRules(discovery, {
    rulesPack: pack,
    severityOverrides: project.severityOverrides,
    disabledRuleIds: project.disabledRuleIds,
    onRuleEvaluated: (e) => {
      events.push({
        type: 'rule',
        ruleId: e.ruleId,
        findings: e.findings.length,
        index: e.index,
        total: e.total,
      });
      for (const f of e.findings) collected.push(f);
    },
  });
  for (const evt of events) yield evt;

  yield { type: 'persist', phase: 'begin' };
  const conn = await getConnection();
  const result: ScanResult = {
    rootPath: discovery.rootPath,
    scannedAt: discovery.scannedAt,
    discovery: discovery.summary,
    findings: collected,
    rulesVersion: `${pack.manifest.version} (${pack.source})`,
    audithexVersion: 'web-ui',
    elapsedMs: Date.now() - startedAt,
  };
  const saved = await saveScanRun(conn, {
    scan: result,
    projectId,
  });
  yield {
    type: 'done',
    scanId: String(saved._id),
    totalFindings: collected.length,
    elapsedMs: result.elapsedMs,
  };
}

/**
 * Re-exported so the SSE route handler can use the same `findProject`
 * shape the CLI uses for `scan --project <name>`. Keeps the project
 * lookup in one place.
 */
export { getProjectByName };
