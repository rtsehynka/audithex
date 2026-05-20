import { discover } from '@audithex/core-discovery';
import { evaluateFixture } from '@audithex/core-eval-runner';
import { t } from '@audithex/core-i18n';
import { runRules } from '@audithex/core-rules';
import type { Command } from 'commander';
import type { AudithexEnv } from '../env.js';

export function registerSelftestCommand(program: Command, env: AudithexEnv): void {
  void env;
  program
    .command('selftest')
    .description(t('cli:commands.selftest.summary'))
    .action(() => {
      // Fixtures arrive in week 4. Until then selftest verifies that the
      // pipeline runs end-to-end on the current working directory with the
      // bundled rules, producing zero findings on the framework itself.
      const discovery = discover({ rootPath: process.cwd() });
      const findings = runRules(discovery);
      const evaluation = evaluateFixture(
        {
          schemaVersion: '0.1',
          fixture: 'pipeline-smoke',
          expectedFindings: [],
          notExpected: [],
        },
        findings,
      );
      const verdict = evaluation.passed ? 'PASS' : 'FAIL';
      process.stdout.write(
        `selftest: ${verdict} (precision=${evaluation.precision.toFixed(2)}, recall=${evaluation.recall.toFixed(2)})\n`,
      );
      process.exitCode = evaluation.passed ? 0 : 2;
    });
}
