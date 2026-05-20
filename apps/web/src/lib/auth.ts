import { findUserByEmail, verifyPassword } from '@audithex/core-persistence';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getConnection } from './db';
import {
  SESSION_COOKIE_NAME,
  type SessionPayload,
  buildSessionPayload,
  signSession,
  verifySession,
} from './session';

export interface CredentialsCheck {
  ok: boolean;
  userId?: string;
  email?: string;
}

export async function checkCredentials(email: string, password: string): Promise<CredentialsCheck> {
  const conn = await getConnection();
  const user = await findUserByEmail(conn, email);
  if (!user) return { ok: false };
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { ok: false };
  return { ok: true, userId: String(user._id), email: user.email };
}

export async function startSession(userId: string, email: string): Promise<void> {
  const payload = buildSessionPayload(userId, email);
  const token = await signSession(payload);
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    expires: new Date(payload.exp * 1000),
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE_NAME);
}

export async function readSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return await verifySession(jar.get(SESSION_COOKIE_NAME)?.value);
}

export async function requireSession(redirectTo = '/login'): Promise<SessionPayload> {
  const session = await readSession();
  if (!session) redirect(redirectTo);
  return session;
}
