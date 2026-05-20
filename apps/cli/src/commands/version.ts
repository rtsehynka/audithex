import { t } from '@audithex/core-i18n';
import type { Command } from 'commander';
import { AUDITHEX_VERSION } from '../index.js';

export function registerVersionCommand(program: Command): void {
  program
    .command('version')
    .description(t('cli:commands.version.summary'))
    .action(() => {
      process.stdout.write(`${AUDITHEX_VERSION}\n`);
    });
}
