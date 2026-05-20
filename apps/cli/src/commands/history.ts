import { t } from '@audithex/core-i18n';
import {
  connectMongo,
  countScanRuns,
  disconnectAll,
  getScanRunById,
  listScanRuns,
} from '@audithex/core-persistence';
import type { Command } from 'commander';
import type { Connection } from 'mongoose';
import type { AudithexEnv } from '../env.js';

interface HistoryCommandOptions {
  limit?: string;
  skip?: string;
  rootPath?: string;
  show?: string;
  json?: boolean;
}

export function registerHistoryCommand(program: Command, env: AudithexEnv): void {
  program
    .command('history')
    .description(t('cli:commands.history.summary'))
    .option('-n, --limit <count>', t('history:flags.limit'), '20')
    .option('--skip <count>', t('history:flags.skip'), '0')
    .option('--root-path <path>', t('history:flags.rootPath'))
    .option('--show <id>', t('history:flags.show'))
    .option('--json', t('history:flags.json'), false)
    .action(async (options: HistoryCommandOptions) => {
      if (!env.MONGODB_URI) {
        process.stderr.write(`${t('history:mongoMissing')}\n`);
        process.exitCode = 2;
        return;
      }

      let conn: Connection;
      try {
        conn = await connectMongo(env.MONGODB_URI, { silent: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`${t('history:connectFailed', { error: message })}\n`);
        process.exitCode = 2;
        return;
      }

      try {
        if (options.show) {
          const run = await getScanRunById(conn, options.show);
          if (!run) {
            process.stderr.write(`${t('history:notFound', { id: options.show })}\n`);
            process.exitCode = 2;
            return;
          }
          if (options.json) {
            process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
          } else {
            process.stdout.write(`${renderScanDetail(run)}\n`);
          }
          process.exitCode = 0;
          return;
        }

        const limit = parsePositiveInt(options.limit, 20);
        const skip = parsePositiveInt(options.skip, 0);
        const rootPath = options.rootPath?.trim() || undefined;
        const [runs, total] = await Promise.all([
          listScanRuns(conn, { limit, skip, ...(rootPath ? { rootPath } : {}) }),
          countScanRuns(conn),
        ]);

        if (options.json) {
          process.stdout.write(`${JSON.stringify({ total, limit, skip, runs }, null, 2)}\n`);
          process.exitCode = 0;
          return;
        }

        if (runs.length === 0) {
          process.stdout.write(`${t('history:empty')}\n`);
          process.exitCode = 0;
          return;
        }

        process.stdout.write(`${t('history:header', { total })}\n`);
        for (const run of runs) {
          process.stdout.write(`${renderScanRow(run)}\n`);
        }
        process.exitCode = 0;
      } finally {
        await disconnectAll();
      }
    });
}

interface ScanRunRow {
  _id?: unknown;
  rootPath: string;
  scannedAt: string;
  topSeverity: string;
  findings: readonly { ruleId: string; severity: string }[];
  rulesVersion: string;
  elapsedMs: number;
}

function countBySeverity(findings: ScanRunRow['findings']): Record<string, number> {
  return findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});
}

function renderScanRow(run: ScanRunRow): string {
  const id = String(run._id ?? '');
  const counts = countBySeverity(run.findings);
  const summary = ['critical', 'high', 'medium', 'low']
    .map((s) => `${s[0]?.toUpperCase()}${counts[s] ?? 0}`)
    .join(' ');
  return [id, run.scannedAt, run.topSeverity.padEnd(8), summary, run.rootPath].join('  ');
}

function renderScanDetail(run: ScanRunRow): string {
  const id = String(run._id ?? '');
  const counts = countBySeverity(run.findings);
  return [
    `id          ${id}`,
    `rootPath    ${run.rootPath}`,
    `scannedAt   ${run.scannedAt}`,
    `rules       ${run.rulesVersion}`,
    `elapsedMs   ${run.elapsedMs}`,
    `topSeverity ${run.topSeverity}`,
    `findings    critical=${counts.critical ?? 0} high=${counts.high ?? 0} medium=${counts.medium ?? 0} low=${counts.low ?? 0}`,
  ].join('\n');
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}
