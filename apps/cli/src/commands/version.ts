import { t } from '@audithex/core-i18n';
import type { Command } from 'commander';
import { AUDITHEX_VERSION } from '../index.js';

/**
 * Mirrors the GNU `--version` convention so anyone running the CLI
 * sees, on one line, that the software ships under AGPL-3.0-or-later
 * with NO WARRANTY. Goes through t() so the disclaimer block is
 * translated alongside the rest of the UI.
 */
export function registerVersionCommand(program: Command): void {
  program
    .command('version')
    .description(t('cli:commands.version.summary'))
    .action(() => {
      const lines = [
        `audithex ${AUDITHEX_VERSION}`,
        t('cli:version.legal.copyright'),
        t('cli:version.legal.license'),
        t('cli:version.legal.freedom'),
        t('cli:version.legal.noWarranty'),
      ];
      process.stdout.write(`${lines.join('\n')}\n`);
    });
}
