import { loadWebEnv } from './env';

/**
 * Cookie-based, server-signed session. Web-Crypto HMAC so the helpers
 * work in both the Node server runtime and the Edge runtime that
 * Next.js middleware uses. No external dependency.
 *
 * Token format: `${base64url(payload-json)}.${base64url(hmac-sha256)}`
 */

export interface SessionPayload {
  userId: string;
  email: string;
  /** Expiry as unix epoch seconds. */
  exp: number;
}

export const SESSION_COOKIE_NAME = 'audithex_session';

export async function signSession(payload: SessionPayload): Promise<string> {
  const env = loadWebEnv();
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = base64UrlEncode(await hmac(env.AUDITHEX_UI_SESSION_SECRET, body));
  return `${body}.${sig}`;
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token || typeof token !== 'string') return null;
  const env = loadWebEnv();
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];

  const key = await importKey(env.AUDITHEX_UI_SESSION_SECRET);
  const given = base64UrlDecode(sig);
  const valid = await crypto.subtle.verify('HMAC', key, given, new TextEncoder().encode(body));
  if (!valid) return null;

  let payload: SessionPayload;
  try {
    const json = new TextDecoder().decode(base64UrlDecode(body));
    payload = JSON.parse(json) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof payload.userId !== 'string' || typeof payload.email !== 'string') return null;
  if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}

export function buildSessionPayload(userId: string, email: string): SessionPayload {
  const env = loadWebEnv();
  return {
    userId,
    email,
    exp: Math.floor(Date.now() / 1000) + env.AUDITHEX_UI_SESSION_TTL_SECONDS,
  };
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function hmac(secret: string, body: string): Promise<Uint8Array> {
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return new Uint8Array(sig);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.length; i += 1) str += String.fromCharCode(bytes[i] ?? 0);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string): Uint8Array {
  const padded = s
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(s.length + ((4 - (s.length % 4)) % 4), '=');
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
