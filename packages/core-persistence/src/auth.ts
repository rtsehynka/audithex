import bcrypt from 'bcryptjs';

/**
 * Single-user auth primitives backed by bcryptjs (pure-JS — no native
 * binding rebuild dance). 12 rounds matches modern OWASP guidance.
 */
const DEFAULT_ROUNDS = 12;

export async function hashPassword(plain: string, rounds = DEFAULT_ROUNDS): Promise<string> {
  if (plain.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }
  return bcrypt.hash(plain, rounds);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
