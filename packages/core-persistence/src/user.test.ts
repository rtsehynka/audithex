import { afterEach, describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './auth.js';
import { getUserModel } from './models/user.js';
import {
  createUser,
  findUserByEmail,
  findUserById,
  updateUserEmail,
  updateUserPassword,
} from './repository.js';
import { setupMongoFixture } from './test-helpers/mongo-fixture.js';

const { getConn } = setupMongoFixture();

afterEach(async () => {
  await getUserModel(getConn()).deleteMany({});
});

describe('User account updates', () => {
  it('updateUserEmail changes the email (lowercased) and lets findUserByEmail resolve the new address', async () => {
    const created = await createUser(getConn(), {
      email: 'tester@audithex.local',
      passwordHash: await hashPassword('secret-123'),
    });
    const result = await updateUserEmail(getConn(), String(created._id), 'New@Audithex.Local');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.user.email).toBe('new@audithex.local');
    const found = await findUserByEmail(getConn(), 'new@audithex.local');
    expect(found).not.toBeNull();
    const old = await findUserByEmail(getConn(), 'tester@audithex.local');
    expect(old).toBeNull();
  });

  it('updateUserEmail rejects duplicates against another user', async () => {
    await createUser(getConn(), {
      email: 'a@audithex.local',
      passwordHash: await hashPassword('pw-a-12345'),
    });
    const b = await createUser(getConn(), {
      email: 'b@audithex.local',
      passwordHash: await hashPassword('pw-b-12345'),
    });
    const result = await updateUserEmail(getConn(), String(b._id), 'a@audithex.local');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('duplicate');
  });

  it('updateUserEmail allows setting the email to the same value (same-id check)', async () => {
    const u = await createUser(getConn(), {
      email: 'same@audithex.local',
      passwordHash: await hashPassword('pw-same-1'),
    });
    const result = await updateUserEmail(getConn(), String(u._id), 'same@audithex.local');
    expect(result.ok).toBe(true);
  });

  it('updateUserPassword swaps the hash so verifyPassword works with the new password only', async () => {
    const u = await createUser(getConn(), {
      email: 'pw@audithex.local',
      passwordHash: await hashPassword('original-pw-1'),
    });
    const newHash = await hashPassword('rotated-pw-2');
    const result = await updateUserPassword(getConn(), String(u._id), newHash);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(await verifyPassword('rotated-pw-2', result.user.passwordHash)).toBe(true);
    expect(await verifyPassword('original-pw-1', result.user.passwordHash)).toBe(false);
  });

  it('findUserById returns the user when present and null otherwise', async () => {
    const u = await createUser(getConn(), {
      email: 'byid@audithex.local',
      passwordHash: await hashPassword('byid-pw-12'),
    });
    const found = await findUserById(getConn(), String(u._id));
    expect(found?.email).toBe('byid@audithex.local');
    const missing = await findUserById(getConn(), '000000000000000000000000');
    expect(missing).toBeNull();
  });
});
