import { join } from 'node:path';
import { resolve } from 'node:path';
import { discover } from '@audithex/core-discovery';
import { t } from '@audithex/core-i18n';
import { type ReportFormat, renderReport } from '@audithex/core-report';
import { loadRulesPack, runRules } from '@audithex/core-rules';
import { type ScanResult, exitCodeFromFindings } from '@audithex/core-types';
import { audithexHome } from '@audithex/core-update';
import type { Command } from 'commander';
import type { AudithexEnv } from '../env.js';
import { AUDITHEX_VERSION } from '../index.js';

const VALID_REPORTS = new Set<ReportFormat>(['console', 'json', 'md']);

export function registerScanCommand(program: Command, env: AudithexEnv): void {
  void env;
  program
    .command('scan')
    .description(t('cli:commands.scan.summary'))
    .argument('[path]', '', '.')
    .option('-r, --report <format>', t('cli:commands.scan.options.report'), 'console')
    .option('-s, --severity <level>', t('cli:commands.scan.options.severity'))
    .option('-d, --dynamic', t('cli:commands.scan.options.dynamic'), false)
    .option('--ci', t('cli:commands.scan.options.ci'), false)
    .option('--no-update-check', t('cli:commands.scan.options.noUpdateCheck'))
    .action(async (path: string, options: ScanOptions) => {
      const format = (options.report ?? 'console') as ReportFormat;
      if (!VALID_REPORTS.has(format)) {
        process.stderr.write(`Unknown --report value: ${format}\n`);
        process.exitCode = 2;
        return;
      }

      const startedAt = Date.now();
      const absolute = resolve(process.cwd(), path);
      const discovery = discover({ rootPath: absolute });
      const userRulesPackDir = join(audithexHome(), 'rules-pack', 'current');
      const pack = loadRulesPack({ userRulesPackDir });
      const findings = runRules(discovery, { rulesPack: pack });
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
      process.exitCode = exitCodeFromFindings(findings);
    });
}

interface ScanOptions {
  report?: string;
  severity?: string;
  dynamic?: boolean;
  ci?: boolean;
  updateCheck?: boolean;
}
