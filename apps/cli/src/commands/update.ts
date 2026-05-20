import { discover } from '@audithex/core-discovery';
import { t } from '@audithex/core-i18n';
import { loadRulesPack, runRules } from '@audithex/core-rules';
import {
  DEFAULT_RULES_PACK_GIT_URL,
  audithexHome,
  currentPackPath,
  readCurrentCommit,
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
      const rulesPackUrl = env.AUDITHEX_RULES_PACK_URL ?? DEFAULT_RULES_PACK_GIT_URL;

      const currentPack = loadRulesPack({ userRulesPackDir: currentPackPath(home) });
      const currentCommit = readCurrentCommit(home);
      process.stdout.write(`${t('update:checking', { url: rulesPackUrl })}\n`);
      process.stdout.write(
        `${t('update:currentVersion', {
          version: currentPack.manifest.version,
          commit: currentCommit ?? t('update:noCommit'),
        })}\n`,
      );

      if (!options.yes) {
        const reply = await confirm({ message: t('update:applyPrompt'), initialValue: true });
        if (isCancel(reply) || reply === false) {
          process.stdout.write(
            `${t('update:applyDeclined', { version: currentPack.manifest.version })}\n`,
          );
          process.exitCode = 0;
          return;
        }
      }

      const result = await runUpdate({
        home,
        rulesPackUrl,
        selftest: (packDir) => selftestNewPack(packDir),
      });

      switch (result.kind) {
        case 'up-to-date':
          process.stdout.write(`${t('update:alreadyLatest', { commit: result.commit })}\n`);
          process.exitCode = 0;
          return;
        case 'installed':
          process.stdout.write(
            `${t('update:installed', {
              from: result.from ?? t('update:noCommit'),
              to: result.to,
              version: result.manifestVersion,
            })}\n`,
          );
          process.exitCode = 0;
          return;
        case 'rolled-back':
          process.stderr.write(
            `${t('update:selftestFailed', {
              attempted: result.attempted,
              previous: result.from ?? t('update:noCommit'),
            })}\n`,
          );
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
    // rules. We are not yet asserting expected findings (the
    // banking-bot fixture is the future contract for "real" selftest);
    // we only verify the new pack does not throw during load or evaluation.
    const discovery = discover({ rootPath: process.cwd() });
    runRules(discovery, { rulesPack: pack });
    return true;
  } catch {
    return false;
  }
}
