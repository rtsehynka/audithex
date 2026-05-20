import { t } from '@audithex/core-i18n';
import { BUNDLED_RULES_VERSION, evaluateUpdate, readLocalManifest } from '@audithex/core-update';
import type { Command } from 'commander';
import type { AudithexEnv } from '../env.js';

export function registerUpdateCommand(program: Command, env: AudithexEnv): void {
  void env;
  program
    .command('update')
    .description(t('cli:commands.update.summary'))
    .action(() => {
      const manifest = readLocalManifest();
      const current = manifest?.version ?? BUNDLED_RULES_VERSION;
      process.stdout.write(`${t('update:checking')}\n`);
      process.stdout.write(`${t('update:currentVersion', { version: current })}\n`);
      // The remote channel is wired in week 4; until then we only report state.
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
