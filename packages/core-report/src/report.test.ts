import { initI18n } from '@audithex/core-i18n';
import type { ScanResult } from '@audithex/core-types';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderJson, renderMarkdown, renderReport } from './index.js';

const result: ScanResult = {
  rootPath: '/tmp/sample',
  scannedAt: '2026-05-20T00:00:00Z',
  discovery: {
    totalFiles: 5,
    byExtension: { '.ts': 3, '.md': 2 },
    envFiles: 1,
    skippedByGitignore: 4,
    elapsedMs: 12,
  },
  findings: [],
  rulesVersion: '0.0.0-dev',
  audithexVersion: '0.0.0-dev',
  elapsedMs: 99,
};

describe('renderReport', () => {
  beforeAll(async () => {
    await initI18n('en');
  });

  it('renders a JSON snapshot', () => {
    const parsed = JSON.parse(renderJson(result));
    expect(parsed.discovery.totalFiles).toBe(5);
  });

  it('renders markdown with no-findings notice', () => {
    expect(renderMarkdown(result)).toContain('clean');
  });

  it('renderReport(console) includes the app name', () => {
    expect(renderReport('console', result)).toContain('Audithex');
  });
});
