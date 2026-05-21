import { resolve as resolvePath } from 'node:path';
import { t } from '@audithex/core-i18n';
import {
  connectMongo,
  createProject,
  deleteProject,
  disconnectAll,
  getProjectByName,
  listProjects,
} from '@audithex/core-persistence';
import { cancel, confirm, isCancel, text as textPrompt } from '@clack/prompts';
import type { Command } from 'commander';
import type { Connection } from 'mongoose';
import type { AudithexEnv } from '../env.js';

interface CreateOptions {
  name?: string;
  rootPath?: string;
  description?: string;
  disable?: string;
}

interface DeleteOptions {
  force?: boolean;
}

const RULE_ID_PATTERN = /^R\d{3}$/;

/**
 * Every project subcommand needs the same Mongo handshake: bail if
 * MONGODB_URI is missing, connect, hand the connection to the action,
 * disconnect on the way out. Routing that through one helper keeps the
 * subcommand bodies focused on their unique work.
 */
async function withMongo(
  env: AudithexEnv,
  action: (conn: Connection) => Promise<void>,
): Promise<void> {
  if (!env.MONGODB_URI) {
    process.stderr.write(`${t('project:mongoMissing')}\n`);
    process.exitCode = 2;
    return;
  }
  try {
    const conn = await connectMongo(env.MONGODB_URI, { silent: true });
    await action(conn);
  } finally {
    await disconnectAll();
  }
}

export function registerProjectCommand(program: Command, env: AudithexEnv): void {
  const project = program.command('project').description(t('cli:commands.project.summary'));

  project
    .command('create')
    .description(t('project:create.summary'))
    .option('--name <name>', t('project:create.flags.name'))
    .option('--root-path <path>', t('project:create.flags.rootPath'))
    .option('--description <text>', t('project:create.flags.description'))
    .option('--disable <ids>', t('project:create.flags.disable'))
    .action(async (options: CreateOptions) => {
      const name = (options.name ?? (await promptName()))?.trim();
      if (!name) {
        process.exitCode = 1;
        return;
      }
      const rootPath = (options.rootPath ?? (await promptRootPath()))?.trim();
      if (!rootPath) {
        process.exitCode = 1;
        return;
      }
      const description = options.description?.trim() || null;
      const disabledRuleIds = parseRuleIds(options.disable);
      if (disabledRuleIds === null) {
        process.stderr.write(`${t('project:invalidRuleIds')}\n`);
        process.exitCode = 2;
        return;
      }
      await withMongo(env, async (conn) => {
        try {
          const existing = await getProjectByName(conn, name);
          if (existing) {
            process.stderr.write(`${t('project:create.exists', { name })}\n`);
            process.exitCode = 2;
            return;
          }
          const created = await createProject(conn, {
            name,
            rootPath: resolvePath(rootPath),
            description,
            disabledRuleIds,
          });
          process.stdout.write(
            `${t('project:create.ok', { name: created.name, id: String(created._id) })}\n`,
          );
          process.exitCode = 0;
        } catch (err) {
          process.stderr.write(`${t('project:create.failed', { error: messageOf(err) })}\n`);
          process.exitCode = 2;
        }
      });
    });

  project
    .command('list')
    .description(t('project:list.summary'))
    .option('--json', t('project:list.flags.json'), false)
    .action(async (options: { json?: boolean }) => {
      await withMongo(env, async (conn) => {
        const projects = await listProjects(conn);
        if (options.json) {
          process.stdout.write(`${JSON.stringify(projects, null, 2)}\n`);
          process.exitCode = 0;
          return;
        }
        if (projects.length === 0) {
          process.stdout.write(`${t('project:list.empty')}\n`);
          process.exitCode = 0;
          return;
        }
        process.stdout.write(`${t('project:list.header', { count: projects.length })}\n`);
        for (const p of projects) {
          const overridesCount = Object.keys(p.severityOverrides ?? {}).length;
          process.stdout.write(
            `${p.name.padEnd(24)}  ${p.rootPath}  (disabled=${p.disabledRuleIds.length}, overrides=${overridesCount})\n`,
          );
        }
        process.exitCode = 0;
      });
    });

  project
    .command('show <name>')
    .description(t('project:show.summary'))
    .action(async (name: string) => {
      await withMongo(env, async (conn) => {
        const found = await requireProject(conn, name);
        if (!found) return;
        process.stdout.write(`${JSON.stringify(found, null, 2)}\n`);
        process.exitCode = 0;
      });
    });

  project
    .command('delete <name>')
    .description(t('project:delete.summary'))
    .option('-y, --force', t('project:delete.flags.force'), false)
    .action(async (name: string, options: DeleteOptions) => {
      await withMongo(env, async (conn) => {
        const found = await requireProject(conn, name);
        if (!found) return;
        if (options.force !== true) {
          const ok = await confirm({
            message: t('project:delete.confirm', { name }),
            initialValue: false,
          });
          if (isCancel(ok) || ok !== true) {
            cancel(t('project:delete.cancelled'));
            process.exitCode = 0;
            return;
          }
        }
        await deleteProject(conn, String(found._id));
        process.stdout.write(`${t('project:delete.ok', { name })}\n`);
        process.exitCode = 0;
      });
    });
}

async function promptName(): Promise<string | null> {
  const v = await textPrompt({
    message: t('project:create.prompts.name'),
    validate: (input) =>
      typeof input === 'string' && input.trim().length > 0
        ? undefined
        : (t('project:create.prompts.nameRequired') as string),
  });
  if (isCancel(v)) {
    cancel(t('project:create.cancelled'));
    return null;
  }
  return String(v);
}

async function promptRootPath(): Promise<string | null> {
  const v = await textPrompt({
    message: t('project:create.prompts.rootPath'),
    validate: (input) =>
      typeof input === 'string' && input.trim().length > 0
        ? undefined
        : (t('project:create.prompts.rootPathRequired') as string),
  });
  if (isCancel(v)) {
    cancel(t('project:create.cancelled'));
    return null;
  }
  return String(v);
}

async function requireProject(conn: Connection, name: string): ReturnType<typeof getProjectByName> {
  const found = await getProjectByName(conn, name);
  if (!found) {
    process.stderr.write(`${t('project:notFound', { name })}\n`);
    process.exitCode = 2;
  }
  return found;
}

function parseRuleIds(raw: string | undefined): string[] | null {
  if (!raw) return [];
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const id of ids) {
    if (!RULE_ID_PATTERN.test(id)) return null;
  }
  return ids;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
