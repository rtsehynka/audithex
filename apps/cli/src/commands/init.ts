import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { t } from '@audithex/core-i18n';
import type { Command } from 'commander';
import type { AudithexEnv } from '../env.js';

interface AudithexProjectConfig {
  schemaVersion: '0.1';
  scan: {
    includeGlobs: string[];
    excludeGlobs: string[];
  };
  rules: {
    overrides: Record<
      string,
      { severity?: 'critical' | 'high' | 'medium' | 'low'; disabled?: boolean }
    >;
  };
  dynamic: {
    enabled: boolean;
  };
}

const DEFAULT_CONFIG: AudithexProjectConfig = {
  schemaVersion: '0.1',
  scan: {
    includeGlobs: ['**/*.{ts,tsx,js,jsx,mjs,cjs,md,txt}'],
    excludeGlobs: ['node_modules/**', 'dist/**', 'build/**', '.next/**'],
  },
  rules: { overrides: {} },
  dynamic: { enabled: false },
};

export function registerInitCommand(program: Command, env: AudithexEnv): void {
  void env;
  program
    .command('init')
    .description(t('cli:commands.init.summary'))
    .action(() => {
      const targetDir = resolve(process.cwd(), '.audithex');
      const target = join(targetDir, 'config.json');
      if (existsSync(target)) {
        process.stdout.write(`Config already exists: ${target}\n`);
        return;
      }
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(target, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, 'utf8');
      process.stdout.write(`Created ${target}\n`);
    });
}
