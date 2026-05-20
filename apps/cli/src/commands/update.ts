import { join } from 'node:path';
import { t } from '@audithex/core-i18n';
import { loadRulesPack } from '@audithex/core-rules';
import { audithexHome, evaluateUpdate } from '@audithex/core-update';
import type { Command } from 'commander';
import type { AudithexEnv } from '../env.js';

export function registerUpdateCommand(program: Command, env: AudithexEnv): void {
  void env;
  program
    .command('update')
    .description(t('cli:commands.update.summary'))
    .action(() => {
      const userRulesPackDir = join(audithexHome(), 'rules-pack', 'current');
      const pack = loadRulesPack({ userRulesPackDir });
      const current = pack.manifest.version;
      process.stdout.write(`${t('update:checking')}\n`);
      process.stdout.write(`${t('update:currentVersion', { version: current })}\n`);
      // The remote channel is wired in week 4. For now report that we
      // are already at the version present on disk (bundled or user).
      const evaluation = evaluateUpdate(current, current);
      if (evaluation.upToDate) {
        process.stdout.write(`${t('update:alreadyLatest')}\n`);
      } else {
        process.stdout.write(
          `${t('update:available', { from: current, to: evaluation.latest })}\n`,
        );
      }
      process.stdout.write(`${t('update:notYetImplemented')}\n`);
    });
}
