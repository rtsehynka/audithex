'use server';

import {
  findUserById,
  hashPassword,
  updateUserEmail,
  updateUserPassword,
  verifyPassword,
} from '@audithex/core-persistence';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession, startSession } from '../../../lib/auth';
import { getConnection } from '../../../lib/db';
import { collectFieldErrors } from '../../../lib/form-errors';

export interface AccountActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const EmailSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newEmail: z.string().email('Enter a valid email address.'),
});

const PasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required.'),
    newPassword: z.string().min(8, 'Use at least 8 characters.'),
    confirmPassword: z.string().min(1, 'Repeat the new password.'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'New password and confirmation do not match.',
    path: ['confirmPassword'],
  });

/**
 * Both account actions share the same prologue: zod-validate the form,
 * confirm the session user can still verify their current password
 * (so a stolen cookie can't pivot to email/password rewrites), then
 * hand the validated payload to the per-action body. Centralising this
 * keeps both forms in lock-step and keeps jscpd at zero.
 */
async function guardAction<T extends { currentPassword: string }>(
  schema: z.ZodType<T>,
  formData: FormData,
  fields: readonly string[],
): Promise<{ ok: true; data: T; userId: string } | { ok: false; result: AccountActionResult }> {
  const session = await requireSession();
  const raw: Record<string, FormDataEntryValue | null> = {};
  for (const f of fields) raw[f] = formData.get(f);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      result: { ok: false, fieldErrors: collectFieldErrors(parsed.error.issues) },
    };
  }
  const verified = await verifyCurrentPassword(session.userId, parsed.data.currentPassword);
  if (!verified) {
    return {
      ok: false,
      result: {
        ok: false,
        fieldErrors: { currentPassword: 'Current password is incorrect.' },
      },
    };
  }
  return { ok: true, data: parsed.data, userId: session.userId };
}

export async function changeEmailAction(
  _prev: unknown,
  formData: FormData,
): Promise<AccountActionResult> {
  const guarded = await guardAction(EmailSchema, formData, ['currentPassword', 'newEmail']);
  if (!guarded.ok) return guarded.result;

  const conn = await getConnection();
  const result = await updateUserEmail(conn, guarded.userId, guarded.data.newEmail);
  if (!result.ok) {
    if (result.reason === 'duplicate') {
      return { ok: false, fieldErrors: { newEmail: 'That email is already in use.' } };
    }
    if (result.reason === 'not-found') {
      return { ok: false, error: 'User record disappeared. Sign out and back in.' };
    }
    return { ok: false, error: result.message ?? 'Failed to change email.' };
  }
  await startSession(String(result.user._id), result.user.email);
  revalidatePath('/');
  revalidatePath('/settings');
  revalidatePath('/settings/account');
  return { ok: true };
}

export async function changePasswordAction(
  _prev: unknown,
  formData: FormData,
): Promise<AccountActionResult> {
  const guarded = await guardAction(PasswordSchema, formData, [
    'currentPassword',
    'newPassword',
    'confirmPassword',
  ]);
  if (!guarded.ok) return guarded.result;
  if (guarded.data.newPassword === guarded.data.currentPassword) {
    return {
      ok: false,
      fieldErrors: { newPassword: 'New password must differ from the current one.' },
    };
  }

  const conn = await getConnection();
  const newHash = await hashPassword(guarded.data.newPassword);
  const result = await updateUserPassword(conn, guarded.userId, newHash);
  if (!result.ok) {
    return { ok: false, error: result.message ?? 'Failed to change password.' };
  }
  revalidatePath('/settings/account');
  return { ok: true };
}

async function verifyCurrentPassword(userId: string, candidate: string): Promise<boolean> {
  const conn = await getConnection();
  const user = await findUserById(conn, userId);
  if (!user) return false;
  return verifyPassword(candidate, user.passwordHash);
}
