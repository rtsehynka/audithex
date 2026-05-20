import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentPackPath } from './paths.js';
import { readCurrentCommit, runUpdate } from './runner.js';

function git(args: readonly string[], cwd: string): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function gitWithIdentity(args: readonly string[], cwd: string): string {
  return execFileSync(
    'git',
    [
      '-c',
      'user.email=tester@audithex.local',
      '-c',
      'user.name=Audithex Test',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

interface UpstreamRepo {
  /** file:// URL usable as a clone source. */
  url: string;
  /** Working tree the test can mutate, then call publish() to commit. */
  workTree: string;
  /** Commit a snapshot of workTree with the given message. Returns the new HEAD. */
  publish(message: string): string;
  /** Returns the current commit SHA in the upstream. */
  head(): string;
}

function makeUpstream(root: string, ruleIds: readonly string[]): UpstreamRepo {
  const remoteDir = join(root, 'remote.git');
  const workTree = join(root, 'work');
  mkdirSync(remoteDir, { recursive: true });
  mkdirSync(workTree, { recursive: true });

  git(['init', '--bare', '--initial-branch=main'], remoteDir);
  git(['init', '--initial-branch=main'], workTree);
  gitWithIdentity(['remote', 'add', 'origin', remoteDir], workTree);

  writeManifest(workTree, '0.1.0', ruleIds);
  for (const id of ruleIds) writeRule(workTree, id);
  writePatternBundle(workTree);

  gitWithIdentity(['add', '.'], workTree);
  gitWithIdentity(['commit', '-m', 'initial pack'], workTree);
  gitWithIdentity(['push', '-u', 'origin', 'main'], workTree);

  const publish = (message: string): string => {
    gitWithIdentity(['add', '.'], workTree);
    gitWithIdentity(['commit', '-m', message], workTree);
    gitWithIdentity(['push', 'origin', 'main'], workTree);
    return git(['rev-parse', 'HEAD'], workTree).trim();
  };
  const head = (): string => git(['rev-parse', 'HEAD'], workTree).trim();
  return { url: `file://${remoteDir}`, workTree, publish, head };
}

function writeManifest(dir: string, version: string, ruleIds: readonly string[]): void {
  const manifest = {
    _id: 'audithex-rules-pack',
    schemaVersion: '0.1',
    version,
    releasedAt: '2026-05-20T00:00:00Z',
    ruleIds: [...ruleIds],
    patternBundleIds: ['secrets-llm-providers-v1'],
  };
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function writeRule(dir: string, id: string): void {
  mkdirSync(join(dir, 'rules'), { recursive: true });
  const rule = {
    _id: id,
    schemaVersion: '0.1',
    severity: 'low',
    owasp: ['LLM06'],
    engine: 'regex-in-code',
    params: { inlinePatterns: [{ id: 'p1', regex: 'placeholder' }] },
    messageKey: `findings:${id}.message`,
    fixKey: `findings:${id}.fix`,
  };
  writeFileSync(join(dir, 'rules', `${id}.json`), `${JSON.stringify(rule, null, 2)}\n`, 'utf8');
}

function writePatternBundle(dir: string): void {
  mkdirSync(join(dir, 'patterns'), { recursive: true });
  const bundle = {
    _id: 'secrets-llm-providers-v1',
    schemaVersion: '0.1',
    kind: 'secret-patterns',
    source: 'test-fixture',
    entries: [],
  };
  writeFileSync(
    join(dir, 'patterns', 'secrets-llm-providers-v1.json'),
    `${JSON.stringify(bundle, null, 2)}\n`,
    'utf8',
  );
}

describe('runUpdate (git channel)', () => {
  let workspace: string;
  let home: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'audithex-git-'));
    home = join(workspace, 'home');
    mkdirSync(home, { recursive: true });
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('clones on first install and exposes the manifest', async () => {
    const upstream = makeUpstream(join(workspace, 'upstream'), ['R001']);
    const result = await runUpdate({ home, rulesPackUrl: upstream.url });
    expect(result.kind).toBe('installed');
    if (result.kind !== 'installed') return;
    expect(result.from).toBeNull();
    expect(result.to).toBe(upstream.head());
    expect(result.manifestVersion).toBe('0.1.0');
    expect(existsSync(join(currentPackPath(home), 'manifest.json'))).toBe(true);
    expect(existsSync(join(currentPackPath(home), 'rules', 'R001.json'))).toBe(true);
    expect(readCurrentCommit(home)).not.toBeNull();
  });

  it('reports up-to-date when the upstream has not moved', async () => {
    const upstream = makeUpstream(join(workspace, 'upstream'), ['R001']);
    await runUpdate({ home, rulesPackUrl: upstream.url });
    const second = await runUpdate({ home, rulesPackUrl: upstream.url });
    expect(second.kind).toBe('up-to-date');
  });

  it('fast-forwards an existing checkout when upstream advances', async () => {
    const upstream = makeUpstream(join(workspace, 'upstream'), ['R001']);
    const first = await runUpdate({ home, rulesPackUrl: upstream.url });
    expect(first.kind).toBe('installed');

    writeManifest(upstream.workTree, '0.2.0', ['R001', 'R002']);
    writeRule(upstream.workTree, 'R002');
    const newHead = upstream.publish('add R002');

    const second = await runUpdate({ home, rulesPackUrl: upstream.url });
    expect(second.kind).toBe('installed');
    if (second.kind !== 'installed') return;
    expect(second.to).toBe(newHead);
    expect(second.manifestVersion).toBe('0.2.0');
    expect(existsSync(join(currentPackPath(home), 'rules', 'R002.json'))).toBe(true);
  });

  it('rolls back via git reset --hard when the selftest fails', async () => {
    const upstream = makeUpstream(join(workspace, 'upstream'), ['R001']);
    const first = await runUpdate({ home, rulesPackUrl: upstream.url });
    if (first.kind !== 'installed') throw new Error('precondition failed');
    const oldHead = first.to;

    writeRule(upstream.workTree, 'R002');
    writeManifest(upstream.workTree, '0.2.0', ['R001', 'R002']);
    upstream.publish('add R002 (broken)');

    const second = await runUpdate({
      home,
      rulesPackUrl: upstream.url,
      selftest: () => false,
    });
    expect(second.kind).toBe('rolled-back');
    if (second.kind !== 'rolled-back') return;
    expect(second.from).toBe(oldHead);

    // After rollback the working tree must be back at the old commit and R002 must not exist.
    expect(readCurrentCommit(home)?.length).toBeGreaterThan(0);
    expect(existsSync(join(currentPackPath(home), 'rules', 'R002.json'))).toBe(false);
    expect(
      JSON.parse(readFileSync(join(currentPackPath(home), 'manifest.json'), 'utf8')).version,
    ).toBe('0.1.0');
  });

  it('removes the clone when the selftest fails on a first-ever install', async () => {
    const upstream = makeUpstream(join(workspace, 'upstream'), ['R001']);
    const result = await runUpdate({
      home,
      rulesPackUrl: upstream.url,
      selftest: () => false,
    });
    expect(result.kind).toBe('rolled-back');
    if (result.kind !== 'rolled-back') return;
    expect(result.from).toBeNull();
    expect(existsSync(currentPackPath(home))).toBe(false);
  });

  it('activates a clone whose selftest passes', async () => {
    const upstream = makeUpstream(join(workspace, 'upstream'), ['R001']);
    let probedDir = '';
    const result = await runUpdate({
      home,
      rulesPackUrl: upstream.url,
      selftest: (dir) => {
        probedDir = dir;
        return true;
      },
    });
    expect(result.kind).toBe('installed');
    expect(probedDir).toBe(currentPackPath(home));
  });

  it('surfaces fetch errors without leaving a clone on disk', async () => {
    const result = await runUpdate({
      home,
      rulesPackUrl: 'file:///nonexistent/audithex-rules-pack-bogus.git',
    });
    expect(result.kind).toBe('fetch-failed');
    expect(existsSync(currentPackPath(home))).toBe(false);
  });
});
