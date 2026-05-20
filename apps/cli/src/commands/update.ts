import { discover } from '@audithex/core-discovery';
import { t } from '@audithex/core-i18n';
import { loadRulesPack, runRules } from '@audithex/core-rules';
import {
  DEFAULT_MANIFEST_URL,
  audithexHome,
  currentSymlinkPath,
  httpFetcher,
  readCurrentVersion,
  runUpdate,
} from '@audithex/core-update';
import { confirm, isCancel } from '@clack/prompts';
import type { Command } from 'commander';
import type { AudithexEnv } from '../env.js';

interface UpdateCommandOptions {
  yes?: boolean;
}

export function registerUpdateCommand(program: Command, env: AudithexEnv): void {
  program
    .command('update')
    .description(t('cli:commands.update.summary'))
    .option('-y, --yes', t('update:flags.yes'))
    .action(async (options: UpdateCommandOptions) => {
      const home = audithexHome();
      const userRulesPackDir = currentSymlinkPath(home);
      const currentPack = loadRulesPack({ userRulesPackDir });
      const currentVersion = currentPack.manifest.version;
      const manifestUrl = env.AUDITHEX_RULES_PACK_URL ?? DEFAULT_MANIFEST_URL;

      process.stdout.write(`${t('update:checking')}\n`);
      process.stdout.write(`${t('update:fetching', { url: manifestUrl })}\n`);
      process.stdout.write(`${t('update:currentVersion', { version: currentVersion })}\n`);

      if (!options.yes) {
        const reply = await confirm({ message: t('update:applyPrompt'), initialValue: true });
        if (isCancel(reply) || reply === false) {
          process.stdout.write(`${t('update:applyDeclined', { version: currentVersion })}\n`);
          process.exitCode = 0;
          return;
        }
      }

      const result = await runUpdate({
        home,
        manifestUrl,
        fetcher: httpFetcher,
        currentVersion,
        selftest: (packDir) => selftestNewPack(packDir),
      });

      switch (result.kind) {
        case 'up-to-date':
          process.stdout.write(`${t('update:alreadyLatest')}\n`);
          process.exitCode = 0;
          return;
        case 'installed':
          process.stdout.write(`${t('update:installed', { from: result.from, to: result.to })}\n`);
          if (result.prunedVersions.length > 0) {
            process.stdout.write(
              `${t('update:pruned', { count: result.prunedVersions.length })}\n`,
            );
          }
          process.exitCode = 0;
          return;
        case 'rolled-back':
          process.stderr.write(
            `${t('update:selftestFailed', {
              version: result.attempted,
              previous: readCurrentVersion(home) ?? result.from,
            })}\n`,
          );
          process.exitCode = 2;
          return;
        case 'checksum-mismatch':
          process.stderr.write(
            `${t('update:checksumMismatch', {
              expected: result.expected,
              actual: result.actual,
            })}\n`,
          );
          process.exitCode = 2;
          return;
        case 'invalid-payload':
          process.stderr.write(`${t('update:invalidPayload', { reason: result.reason })}\n`);
          process.exitCode = 2;
          return;
        case 'fetch-failed':
          process.stderr.write(`${t('update:fetchFailed', { error: result.error })}\n`);
          process.exitCode = 2;
          return;
      }
    });
}

async function selftestNewPack(packDir: string): Promise<boolean> {
  try {
    const pack = loadRulesPack({ userRulesPackDir: packDir });
    if (pack.source !== 'user') return false;
    // Smoke: walk the current working directory once and run the new
    // rules. We are not yet asserting expected findings (that lands in
    // task #4 with the banking-bot fixture); we only verify the new
    // pack does not throw during load or evaluation.
    const discovery = discover({ rootPath: process.cwd() });
    runRules(discovery, { rulesPack: pack });
    return true;
  } catch {
    return false;
  }
}
