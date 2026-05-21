import { join, resolve } from 'node:path';
import { discover } from '@audithex/core-discovery';
import { t } from '@audithex/core-i18n';
import {
  type ProjectDocument,
  connectMongo,
  getProjectByName,
  saveScanRun,
} from '@audithex/core-persistence';
import { type ReportFormat, renderReport } from '@audithex/core-report';
import { loadRulesPack, runRules } from '@audithex/core-rules';
import { type ScanResult, exitCodeFromFindings } from '@audithex/core-types';
import { audithexHome } from '@audithex/core-update';
import type { Command } from 'commander';
import type { AudithexEnv } from '../env.js';
import { AUDITHEX_VERSION } from '../index.js';

const VALID_REPORTS = new Set<ReportFormat>(['console', 'json', 'md']);

export function registerScanCommand(program: Command, env: AudithexEnv): void {
  program
    .command('scan')
    .description(t('cli:commands.scan.summary'))
    .argument('[path]', '', '.')
    .option('-r, --report <format>', t('cli:commands.scan.options.report'), 'console')
    .option('-s, --severity <level>', t('cli:commands.scan.options.severity'))
    .option('-d, --dynamic', t('cli:commands.scan.options.dynamic'), false)
    .option('--ci', t('cli:commands.scan.options.ci'), false)
    .option('--no-update-check', t('cli:commands.scan.options.noUpdateCheck'))
    .option('-p, --project <name>', t('cli:commands.scan.options.project'))
    .action(async (path: string, options: ScanOptions) => {
      const format = (options.report ?? 'console') as ReportFormat;
      if (!VALID_REPORTS.has(format)) {
        process.stderr.write(`Unknown --report value: ${format}\n`);
        process.exitCode = 2;
        return;
      }

      const projectName = options.project ?? env.AUDITHEX_PROJECT;

      let project: ProjectDocument | null = null;
      let projectError: string | null = null;
      if (projectName) {
        if (!env.MONGODB_URI) {
          process.stderr.write(`${t('scan:projectRequiresMongo')}\n`);
          process.exitCode = 2;
          return;
        }
        try {
          const conn = await connectMongo(env.MONGODB_URI, { silent: true });
          project = await getProjectByName(conn, projectName);
        } catch (err) {
          projectError = err instanceof Error ? err.message : String(err);
        }
        if (!project) {
          process.stderr.write(
            `${t('scan:projectNotFound', { name: projectName, error: projectError ?? '' })}\n`,
          );
          process.exitCode = 2;
          return;
        }
      }

      const rawRoot = project?.rootPath ?? path;
      const absolute = resolve(process.cwd(), rawRoot);

      const startedAt = Date.now();
      const discovery = discover({ rootPath: absolute });
      const userRulesPackDir = join(audithexHome(), 'rules-pack', 'current');
      const pack = loadRulesPack({ userRulesPackDir });
      const findings = runRules(discovery, {
        rulesPack: pack,
        ...(project
          ? {
              severityOverrides: project.severityOverrides,
              disabledRuleIds: project.disabledRuleIds,
            }
          : {}),
      });
      const result: ScanResult = {
        rootPath: discovery.rootPath,
        scannedAt: discovery.scannedAt,
        discovery: discovery.summary,
        findings,
        rulesVersion: `${pack.manifest.version} (${pack.source})`,
        audithexVersion: AUDITHEX_VERSION,
        elapsedMs: Date.now() - startedAt,
      };

      const output = renderReport(format, result);
      if (!options.ci || format !== 'console') {
        process.stdout.write(`${output}\n`);
      }

      if (env.MONGODB_URI) {
        try {
          const conn = await connectMongo(env.MONGODB_URI, { silent: true });
          const saved = await saveScanRun(conn, {
            scan: result,
            ...(project ? { projectId: String(project._id) } : {}),
          });
          process.stdout.write(
            `${t('scan:persisted', {
              id: String(saved._id),
              rootPath: result.rootPath,
              project: project ? project.name : t('scan:noProject'),
            })}\n`,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(`${t('scan:persistFailed', { error: message })}\n`);
        }
      }

      process.exitCode = exitCodeFromFindings(findings);
    });
}

interface ScanOptions {
  report?: string;
  severity?: string;
  dynamic?: boolean;
  ci?: boolean;
  updateCheck?: boolean;
  project?: string;
}
