import { initI18n, t } from '@audithex/core-i18n';
import { Command } from 'commander';
import { registerHistoryCommand } from './commands/history.js';
import { registerInitCommand } from './commands/init.js';
import { registerScanCommand } from './commands/scan.js';
import { registerSelftestCommand } from './commands/selftest.js';
import { registerUpdateCommand } from './commands/update.js';
import { registerVersionCommand } from './commands/version.js';
import { loadEnv } from './env.js';

export const AUDITHEX_VERSION = '0.0.0-dev';

export async function main(argv: readonly string[]): Promise<number> {
  let env: ReturnType<typeof loadEnv>;
  try {
    env = loadEnv();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 2;
  }

  await initI18n(env.AUDITHEX_LOCALE);

  const program = new Command();
  program
    .name('audithex')
    .description(t('cli:description'))
    .version(AUDITHEX_VERSION, '-v, --version', t('cli:commands.version.summary'));

  registerScanCommand(program, env);
  registerUpdateCommand(program, env);
  registerSelftestCommand(program, env);
  registerHistoryCommand(program, env);
  registerInitCommand(program, env);
  registerVersionCommand(program);

  let exitCode = 0;
  program.exitOverride();
  try {
    await program.parseAsync([...argv], { from: 'user' });
    // Commands signal their result by setting process.exitCode. Any
    // non-zero value (set by scan / update / selftest) wins over the
    // default success.
    if (typeof process.exitCode === 'number' && process.exitCode !== 0) {
      exitCode = process.exitCode;
    }
  } catch (error) {
    // commander's exitOverride throws CommanderError on --help / --version / invalid usage.
    // For help / version that's success.
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof (error as { code: string }).code === 'string'
    ) {
      const code = (error as { code: string }).code;
      if (code === 'commander.helpDisplayed' || code === 'commander.version') {
        return 0;
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    exitCode = 2;
  }
  return exitCode;
}

const invokedAsMain =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('audithex.js') ||
    process.argv[1].endsWith('audithex') ||
    process.argv[1].endsWith('apps/cli/src/index.ts') ||
    process.argv[1].endsWith('apps/cli/dist/index.js'));

if (invokedAsMain) {
  main(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
