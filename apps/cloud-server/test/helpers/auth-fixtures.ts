import type pg from 'pg';
import { AccountRepository } from '../../src/db/repositories/account.js';
import { IdentityRepository } from '../../src/db/repositories/identity.js';
import { PasswordCredentialRepository, hashPassword } from '../../src/auth/password.js';
import {
  SessionRepository,
  newTokenFamilyId,
} from '../../src/db/repositories/session.js';
import { generateRefreshToken, hashRefreshToken } from '../../src/auth/password.js';

export async function seedTestAccount(
  pool: pg.Pool,
  input: {
    username: string;
    password: string;
    displayName: string;
    deviceId?: string;
    deviceLabel?: string;
  },
): Promise<{ accountId: string; deviceId: string; refreshToken: string; sessionId: string }> {
  const accounts = new AccountRepository(pool);
  const identities = new IdentityRepository(pool);
  const passwords = new PasswordCredentialRepository(pool);
  const sessions = new SessionRepository(pool);

  const account = await accounts.create({ displayName: input.displayName });
  await identities.createUsernameIdentity(account.account_id, input.username);
  const passwordHash = await hashPassword(input.password);
  await passwords.upsert(account.account_id, passwordHash);

  const deviceId = input.deviceId ?? 'dev_test_device_001';
  const refreshToken = generateRefreshToken();
  const session = await sessions.createSession({
    accountId: account.account_id,
    deviceId,
    label: input.deviceLabel ?? 'Test Device',
    refreshTokenHash: hashRefreshToken(refreshToken),
    tokenFamilyId: newTokenFamilyId(),
  });

  return {
    accountId: account.account_id,
    deviceId,
    refreshToken,
    sessionId: session.session_id,
  };
}

export async function loginTestAccount(
  agent: import('supertest').Agent,
  input: { username: string; password: string; deviceLabel?: string; deviceId?: string },
): Promise<{
  accessToken: string;
  deviceId: string;
  sessionId: string;
  refreshCookie: string;
}> {
  const res = await agent
    .post('/api/cloud/v1/auth/login')
    .send({
      username: input.username,
      password: input.password,
      deviceLabel: input.deviceLabel ?? 'Test Device',
      ...(input.deviceId ? { deviceId: input.deviceId } : {}),
    });
  if (res.status !== 200) {
    throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  }
  const setCookie = res.headers['set-cookie'];
  const cookieHeader = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie ?? '');
  const refreshMatch = cookieHeader.match(/xh_refresh=([^;]+)/);
  if (!refreshMatch) {
    throw new Error('missing refresh cookie');
  }
  return {
    accessToken: res.body.data.accessToken,
    deviceId: res.body.data.session.deviceId,
    sessionId: res.body.data.session.sessionId,
    refreshCookie: refreshMatch[1]!,
  };
}
