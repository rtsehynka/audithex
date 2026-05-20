import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discover } from './scanner.js';

/**
 * Generates `count` synthetic TypeScript files under `root`, spread
 * across 100 nested directories so the walker has realistic fan-out.
 * Every 50th file contains an SDK import + a model literal + a tool
 * definition so every extractor does real work.
 */
function generateSyntheticRepo(root: string, count: number): void {
  const dirs = 100;
  for (let i = 0; i < dirs; i += 1) {
    mkdirSync(join(root, `pkg-${i}`), { recursive: true });
  }
  for (let i = 0; i < count; i += 1) {
    const dir = join(root, `pkg-${i % dirs}`);
    const file = join(dir, `m${i}.ts`);
    const body = i % 50 === 0 ? richTsBody(i) : plainTsBody(i);
    writeFileSync(file, body, 'utf8');
  }
}

function plainTsBody(i: number): string {
  return [
    `// generated synthetic module ${i}`,
    'export interface Item { id: number; name: string }',
    `export function item${i}(n: number): Item {`,
    `  return { id: n + ${i}, name: 'item-${i}' };`,
    '}',
    '',
  ].join('\n');
}

function richTsBody(i: number): string {
  return [
    "import Anthropic from '@anthropic-ai/sdk';",
    "const MODEL = 'claude-opus-4-7';",
    'const client = new Anthropic();',
    `export async function ask${i}(input: string) {`,
    '  return client.messages.create({',
    '    model: MODEL,',
    '    system: "You are a helpful banking assistant who answers in formal English.",',
    "    messages: [{ role: 'user', content: input }],",
    '  });',
    '}',
    `export const tool${i} = {`,
    "  type: 'function' as const,",
    '  function: {',
    `    name: 'lookup_${i}',`,
    `    description: 'Look up record ${i}',`,
    "    parameters: { type: 'object', properties: { id: { type: 'string' } } },",
    '  },',
    '};',
    '',
  ].join('\n');
}

const RUN_BUDGET_MS = 30_000;
const FILE_COUNT = 5_000;
const ENV_FLAG = 'AUDITHEX_RUN_PERF_BENCH';

const shouldRun = process.env[ENV_FLAG] === 'true' || process.env[ENV_FLAG] === '1';

describe.runIf(shouldRun)('discover() — 5k-file performance budget', () => {
  it(
    `scans ${FILE_COUNT} synthetic files in < ${RUN_BUDGET_MS} ms`,
    () => {
      const root = mkdtempSync(join(tmpdir(), 'audithex-perf-'));
      try {
        generateSyntheticRepo(root, FILE_COUNT);
        const start = process.hrtime.bigint();
        const result = discover({ rootPath: root });
        const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;

        // Sanity: the walker should see every generated file and at least
        // some artifacts from the 1-in-50 enriched modules.
        expect(result.files.length).toBe(FILE_COUNT);
        expect(result.artifacts.length).toBeGreaterThan(0);

        // Hard budget — sets the worker-threads trigger for week 3.
        // eslint-disable-next-line no-console
        console.log(
          `[perf] discover(): ${result.files.length} files, ${result.artifacts.length} artifacts, ${elapsedMs.toFixed(0)} ms`,
        );
        expect(elapsedMs).toBeLessThan(RUN_BUDGET_MS);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    RUN_BUDGET_MS + 30_000,
  );
});

describe.runIf(!shouldRun)('discover() — performance budget (skipped)', () => {
  it.skip(`set ${ENV_FLAG}=true to run the 5k-file benchmark`, () => {
    // gated; explicit so `pnpm test` output shows the flag.
  });
});
