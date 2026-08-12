import { SignJWT, jwtVerify } from 'jose';
import type { CloudConfig } from '../config.js';

export type AccessTokenClaims = {
  accountId: string;
  sessionId: string;
  deviceId: string;
  scope: 'full' | 'account:restore';
};

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

function signingKey(config: CloudConfig): Uint8Array {
  return new TextEncoder().encode(config.tokenSigningKey);
}

export async function signAccessToken(
  config: CloudConfig,
  claims: AccessTokenClaims,
): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const token = await new SignJWT({
    accountId: claims.accountId,
    sessionId: claims.sessionId,
    deviceId: claims.deviceId,
    scope: claims.scope,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .setIssuer('xiaohuang-cloud')
    .setAudience('xiaohuang-classroom')
    .sign(signingKey(config));
  return { token, expiresAt };
}

export async function verifyAccessToken(
  config: CloudConfig,
  token: string,
): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(config), {
      issuer: 'xiaohuang-cloud',
      audience: 'xiaohuang-classroom',
    });
    const accountId = payload.accountId;
    const sessionId = payload.sessionId;
    const deviceId = payload.deviceId;
    const scope = payload.scope;
    if (
      typeof accountId !== 'string' ||
      typeof sessionId !== 'string' ||
      typeof deviceId !== 'string' ||
      (scope !== 'full' && scope !== 'account:restore')
    ) {
      return null;
    }
    return { accountId, sessionId, deviceId, scope };
  } catch {
    return null;
  }
}

export const REFRESH_COOKIE_NAME = 'xh_refresh';
export const REFRESH_COOKIE_PATH = '/api/cloud/v1/auth';

export function refreshCookieOptions(config: CloudConfig, expiresAt?: Date) {
  const secure = config.publicOrigin.startsWith('https://');
  const maxAge = expiresAt
    ? Math.max(0, expiresAt.getTime() - Date.now())
    : 30 * 24 * 60 * 60 * 1000;
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: REFRESH_COOKIE_PATH,
    maxAge,
  };
}

export function refreshCookieClearOptions(config: CloudConfig) {
  const secure = config.publicOrigin.startsWith('https://');
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: REFRESH_COOKIE_PATH,
  };
}
