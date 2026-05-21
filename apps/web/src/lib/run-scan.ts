import { join } from 'node:path';
import { scanDatabase } from '@audithex/core-db-scan';
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
  | { type: 'db'; phase: 'begin'; driver: string; tables: number; scanAllTables: boolean }
  | {
      type: 'db';
      phase: 'table';
      table: string;
      rowsScanned: number;
      findingsAdded: number;
      index: number;
      total: number;
    }
  | {
      type: 'db';
      phase: 'end';
      tablesScanned: number;
      rowsScanned: number;
      findingsAdded: number;
      elapsedMs: number;
    }
  | { type: 'db'; phase: 'error'; message: string }
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

  if (project.dbConnection) {
    const dbStart = Date.now();
    yield {
      type: 'db',
      phase: 'begin',
      driver: project.dbConnection.driver,
      tables: project.dbTables?.length ?? 0,
      scanAllTables: project.dbScanAllTables ?? false,
    };
    try {
      const beforeDb = collected.length;
      const tableEvents: ScanRunEvent[] = [];
      const dbResult = await scanDatabase({
        connection: project.dbConnection,
        rulesPack: pack,
        tables: project.dbTables ?? [],
        scanAllTables: project.dbScanAllTables ?? false,
        onTableScanned: (e) => {
          tableEvents.push({
            type: 'db',
            phase: 'table',
            table: e.table,
            rowsScanned: e.rowsScanned,
            findingsAdded: e.findingsAdded,
            index: e.index,
            total: e.total,
          });
        },
      });
      for (const evt of tableEvents) yield evt;
      collected.push(...dbResult.findings);
      yield {
        type: 'db',
        phase: 'end',
        tablesScanned: dbResult.tablesScanned.length,
        rowsScanned: dbResult.rowsScanned,
        findingsAdded: collected.length - beforeDb,
        elapsedMs: Date.now() - dbStart,
      };
    } catch (err) {
      yield {
        type: 'db',
        phase: 'error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

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
