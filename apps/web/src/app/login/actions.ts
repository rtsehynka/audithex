'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { checkCredentials, startSession } from '../../lib/auth';

const LoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  redirectTo: z.string().min(1).default('/'),
});

export interface LoginActionResult {
  ok: false;
  message: string;
}

export async function loginAction(raw: unknown): Promise<LoginActionResult | undefined> {
  const parsed = LoginInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: 'Email and password are required.' };
  }
  const { email, password, redirectTo } = parsed.data;

  const check = await checkCredentials(email, password);
  if (!check.ok || !check.userId || !check.email) {
    return { ok: false, message: 'Invalid email or password.' };
  }
  await startSession(check.userId, check.email);
  redirect(sanitiseRedirect(redirectTo));
}

function sanitiseRedirect(target: string): string {
  if (!target.startsWith('/')) return '/';
  if (target.startsWith('//')) return '/';
  return target;
}
