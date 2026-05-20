import { t } from '@audithex/core-i18n';
import {
  connectMongo,
  createUser,
  disconnectAll,
  findUserByEmail,
  hashPassword,
} from '@audithex/core-persistence';
import { cancel, isCancel, password as passwordPrompt, text as textPrompt } from '@clack/prompts';
import type { Command } from 'commander';
import type { AudithexEnv } from '../env.js';

interface UserCreateOptions {
  email?: string;
  password?: string;
  force?: boolean;
}

export function registerUserCommand(program: Command, env: AudithexEnv): void {
  const user = program.command('user').description(t('cli:commands.user.summary'));

  user
    .command('create')
    .description(t('user:create.summary'))
    .option('--email <email>', t('user:create.flags.email'))
    .option('--password <password>', t('user:create.flags.password'))
    .option('--force', t('user:create.flags.force'), false)
    .action(async (options: UserCreateOptions) => {
      if (!env.MONGODB_URI) {
        process.stderr.write(`${t('user:mongoMissing')}\n`);
        process.exitCode = 2;
        return;
      }

      const email = (options.email ?? (await promptEmail()))?.toLowerCase().trim();
      if (!email || !isLikelyEmail(email)) {
        process.stderr.write(`${t('user:invalidEmail')}\n`);
        process.exitCode = 2;
        return;
      }

      const password = options.password ?? (await promptPassword());
      if (!password) {
        process.exitCode = 1;
        return;
      }
      if (password.length < 8) {
        process.stderr.write(`${t('user:passwordTooShort')}\n`);
        process.exitCode = 2;
        return;
      }

      try {
        const conn = await connectMongo(env.MONGODB_URI, { silent: true });
        const existing = await findUserByEmail(conn, email);
        if (existing && options.force !== true) {
          process.stderr.write(`${t('user:create.exists', { email })}\n`);
          process.exitCode = 2;
          return;
        }

        const passwordHash = await hashPassword(password);
        if (existing && options.force === true) {
          const UserModel = conn.models.User;
          if (UserModel) {
            await UserModel.updateOne({ _id: existing._id }, { passwordHash }).exec();
          }
          process.stdout.write(`${t('user:create.rotated', { email })}\n`);
        } else {
          await createUser(conn, { email, passwordHash });
          process.stdout.write(`${t('user:create.ok', { email })}\n`);
        }
        process.exitCode = 0;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`${t('user:create.failed', { error: message })}\n`);
        process.exitCode = 2;
      } finally {
        await disconnectAll();
      }
    });
}

async function promptEmail(): Promise<string | null> {
  const value = await textPrompt({
    message: t('user:create.prompts.email'),
    validate: (v) => (isLikelyEmail(v) ? undefined : (t('user:invalidEmail') as string)),
  });
  if (isCancel(value)) {
    cancel(t('user:cancelled'));
    return null;
  }
  return String(value);
}

async function promptPassword(): Promise<string | null> {
  const value = await passwordPrompt({
    message: t('user:create.prompts.password'),
    validate: (v) =>
      typeof v === 'string' && v.length >= 8 ? undefined : (t('user:passwordTooShort') as string),
  });
  if (isCancel(value)) {
    cancel(t('user:cancelled'));
    return null;
  }
  return String(value);
}

function isLikelyEmail(s: unknown): boolean {
  if (typeof s !== 'string') return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(s);
}
