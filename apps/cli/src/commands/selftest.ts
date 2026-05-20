import { discover } from '@audithex/core-discovery';
import {
  DEFAULT_THRESHOLDS,
  type FixtureEvaluationResult,
  type LoadedFixture,
  bundledFixturesRoot,
  evaluateFixture,
  listAvailableFixtures,
  loadFixture,
} from '@audithex/core-eval-runner';
import { t } from '@audithex/core-i18n';
import { runRules } from '@audithex/core-rules';
import type { Command } from 'commander';
import type { AudithexEnv } from '../env.js';

interface SelftestCommandOptions {
  fixtureRoot?: string;
  fixture?: string;
}

export function registerSelftestCommand(program: Command, env: AudithexEnv): void {
  void env;
  program
    .command('selftest')
    .description(t('cli:commands.selftest.summary'))
    .option('--fixture-root <path>', t('selftest:flags.fixtureRoot'))
    .option('--fixture <name>', t('selftest:flags.fixture'))
    .action((options: SelftestCommandOptions) => {
      const fixturesRoot = options.fixtureRoot ?? bundledFixturesRoot();
      const names = options.fixture ? [options.fixture] : listAvailableFixtures(fixturesRoot);
      if (names.length === 0) {
        process.stderr.write(`${t('selftest:noFixtures', { root: fixturesRoot })}\n`);
        process.exitCode = 2;
        return;
      }

      const results = names.map((name) => runFixture(loadFixture(name, fixturesRoot)));
      let allPassed = true;
      for (const { fixture, result } of results) {
        const verdict = result.passed ? t('selftest:pass') : t('selftest:fail');
        process.stdout.write(
          `${t('selftest:fixtureLine', {
            fixture: fixture.name,
            verdict,
            tp: result.truePositives,
            fp: result.falsePositives,
            fn: result.falseNegatives,
            precision: result.precision.toFixed(2),
            recall: result.recall.toFixed(2),
          })}\n`,
        );
        if (!result.passed) allPassed = false;
      }

      const overallPrecision = DEFAULT_THRESHOLDS.precision.toFixed(2);
      const overallRecall = DEFAULT_THRESHOLDS.recall.toFixed(2);
      const overall = allPassed ? t('selftest:pass') : t('selftest:fail');
      process.stdout.write(
        `${t('selftest:summary', {
          count: results.length,
          verdict: overall,
          precision: overallPrecision,
          recall: overallRecall,
        })}\n`,
      );
      process.exitCode = allPassed ? 0 : 2;
    });
}

interface FixtureRunResult {
  fixture: LoadedFixture;
  result: FixtureEvaluationResult;
}

export function runFixture(fixture: LoadedFixture): FixtureRunResult {
  const discovery = discover({ rootPath: fixture.rootPath });
  const findings = runRules(discovery);
  const result = evaluateFixture(fixture.expected, findings);
  return { fixture, result };
}
