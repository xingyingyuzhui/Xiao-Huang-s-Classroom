import { z } from 'zod';
import {
  accountIdSchema,
  deviceIdSchema,
  sessionIdSchema,
} from './branded.js';
import { authDeviceLabelSchema } from './auth.js';

/** Electron IPC Schema：preload 只暴露 allowlist 内 channel。 */
export const ipcChannelSchema = z.enum([
  'app:get-version',
  'app:open-devtools',
  'app:relaunch',
  'account:list-saved',
  'account:login',
  'account:remove-card',
  'account:refresh-session',
  'account:logout',
  'account:capabilities',
  'account:restore-session',
  'account:revoke-remote',
]);

export const ACCOUNT_IPC_CHANNELS = [
  'account:list-saved',
  'account:login',
  'account:remove-card',
  'account:refresh-session',
  'account:logout',
  'account:capabilities',
  'account:restore-session',
  'account:revoke-remote',
] as const;

export type AccountIpcChannel = (typeof ACCOUNT_IPC_CHANNELS)[number];

export const ipcRequestSchema = z.object({
  channel: ipcChannelSchema,
  payload: z.unknown(),
});

export type IpcChannel = z.infer<typeof ipcChannelSchema>;

/** Keys a renderer must never use to steer Main's cloud target. */
export const FORBIDDEN_IPC_ORIGIN_KEYS = [
  'cloudOrigin',
  'baseUrl',
  'origin',
  'apiBase',
  'cloudUrl',
  'url',
] as const;

const usernameSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, 'username contains invalid characters');

const ipcDisplayNameSchema = z.string().min(1).max(120);
const ipcAccessTokenSchema = z.string().min(1).max(8192);
const ipcExpiresAtSchema = z.string().datetime();

export const accountIpcEmptyInputSchema = z.union([
  z.undefined(),
  z.null(),
  z.strictObject({}),
]);

export const accountIpcLoginInputSchema = z.strictObject({
  username: usernameSchema,
  password: z.string().min(8).max(128),
  deviceLabel: authDeviceLabelSchema,
  deviceId: deviceIdSchema.optional(),
  rememberMe: z.boolean().optional(),
});

export const accountIpcAccountIdInputSchema = z.strictObject({
  accountId: accountIdSchema,
});

export const accountIpcRefreshInputSchema = z.strictObject({
  accountId: accountIdSchema,
  deviceId: deviceIdSchema,
});

export const accountIpcLogoutInputSchema = z.strictObject({
  accountId: accountIdSchema,
  deviceId: deviceIdSchema.optional(),
});

export const accountIpcRestoreInputSchema = z.strictObject({
  accountId: accountIdSchema.optional(),
  deviceId: deviceIdSchema.optional(),
});

export const accountIpcRevokeRemoteInputSchema = z.strictObject({
  accountId: accountIdSchema,
  sessionId: sessionIdSchema,
});

export const accountIpcSavedCardSchema = z.strictObject({
  accountId: accountIdSchema,
  displayName: ipcDisplayNameSchema,
  avatarUrl: z.string().max(512).nullable(),
  lastUsedAt: ipcExpiresAtSchema,
  vaultRef: z.string().min(1).max(128),
});

export const accountIpcSessionDataSchema = z.strictObject({
  accountId: accountIdSchema,
  displayName: ipcDisplayNameSchema,
  avatarUrl: z.string().max(512).nullable(),
  accessToken: ipcAccessTokenSchema,
  expiresAt: ipcExpiresAtSchema,
  deviceId: deviceIdSchema,
  sessionId: sessionIdSchema,
  remembered: z.boolean(),
});

export const accountIpcRefreshDataSchema = z.strictObject({
  accessToken: ipcAccessTokenSchema,
  expiresAt: ipcExpiresAtSchema,
  deviceId: deviceIdSchema.optional(),
  sessionId: sessionIdSchema.optional(),
});

export const accountIpcOkDataSchema = z.strictObject({
  ok: z.literal(true),
});

export const accountIpcCapabilitiesDataSchema = z.strictObject({
  vaultAvailable: z.boolean(),
  rememberMeAvailable: z.boolean(),
});

export const accountIpcRestoreDataSchema = z.union([
  z.strictObject({ restored: z.literal(false) }),
  z.strictObject({
    restored: z.literal(true),
    accountId: accountIdSchema,
    displayName: ipcDisplayNameSchema,
    avatarUrl: z.string().max(512).nullable(),
    accessToken: ipcAccessTokenSchema,
    expiresAt: ipcExpiresAtSchema,
    deviceId: deviceIdSchema,
    sessionId: sessionIdSchema,
    remembered: z.boolean(),
  }),
]);

export const ipcErrorPayloadSchema = z.strictObject({
  code: z.string().min(1).max(64),
  message: z.string().min(1).max(240),
});

export const ipcFailureResultSchema = z.strictObject({
  success: z.literal(false),
  error: ipcErrorPayloadSchema,
});

export type IpcFailureResult = z.infer<typeof ipcFailureResultSchema>;
export type AccountIpcLoginInput = z.infer<typeof accountIpcLoginInputSchema>;
export type AccountIpcSessionData = z.infer<typeof accountIpcSessionDataSchema>;
export type AccountIpcSavedCard = z.infer<typeof accountIpcSavedCardSchema>;
export type AccountIpcCapabilities = z.infer<typeof accountIpcCapabilitiesDataSchema>;

const ACCOUNT_INPUT_SCHEMAS = {
  'account:list-saved': accountIpcEmptyInputSchema,
  'account:login': accountIpcLoginInputSchema,
  'account:remove-card': accountIpcAccountIdInputSchema,
  'account:refresh-session': accountIpcRefreshInputSchema,
  'account:logout': accountIpcLogoutInputSchema,
  'account:capabilities': accountIpcEmptyInputSchema,
  'account:restore-session': accountIpcRestoreInputSchema,
  'account:revoke-remote': accountIpcRevokeRemoteInputSchema,
} as const;

const ACCOUNT_DATA_SCHEMAS = {
  'account:list-saved': z.array(accountIpcSavedCardSchema),
  'account:login': accountIpcSessionDataSchema,
  'account:remove-card': accountIpcOkDataSchema,
  'account:refresh-session': accountIpcRefreshDataSchema,
  'account:logout': accountIpcOkDataSchema,
  'account:capabilities': accountIpcCapabilitiesDataSchema,
  'account:restore-session': accountIpcRestoreDataSchema,
  'account:revoke-remote': accountIpcOkDataSchema,
} as const;

export function isAccountIpcChannel(channel: string): channel is AccountIpcChannel {
  return (ACCOUNT_IPC_CHANNELS as readonly string[]).includes(channel);
}

export function payloadHasForbiddenOriginField(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  return FORBIDDEN_IPC_ORIGIN_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(payload, key),
  );
}

export function parseAccountIpcPayload<C extends AccountIpcChannel>(
  channel: C,
  payload: unknown,
) {
  return ACCOUNT_INPUT_SCHEMAS[channel].safeParse(payload);
}

export function parseAccountIpcData<C extends AccountIpcChannel>(
  channel: C,
  data: unknown,
) {
  return ACCOUNT_DATA_SCHEMAS[channel].safeParse(data);
}

export function ipcFail(code: string, message: string): IpcFailureResult {
  const safeMessage = message.replace(/\s+/g, ' ').trim().slice(0, 240) || '请求失败';
  return {
    success: false,
    error: {
      code: code.slice(0, 64) || 'INTERNAL_UNKNOWN',
      message: safeMessage,
    },
  };
}

export function ipcOk<T>(data: T): { success: true; data: T } {
  return { success: true, data };
}

export type IpcResult<T> = { success: true; data: T } | IpcFailureResult;

const LOCAL_DEV_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export type TrustedCloudOriginOptions = {
  packaged: boolean;
};

export type TrustedCloudOriginResult =
  | { ok: true; origin: string }
  | { ok: false; code: string; message: string };

/**
 * Cloud origin is Main-owned config. Packaged builds require https;
 * unpackaged additionally allows explicit loopback http.
 */
export function parseTrustedCloudOrigin(
  raw: string,
  options: TrustedCloudOriginOptions,
): TrustedCloudOriginResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, code: 'AUTH_FEATURE_DISABLED', message: '云端地址未配置' };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, code: 'IPC_INVALID_PAYLOAD', message: '云端地址无效' };
  }
  if (url.username || url.password) {
    return { ok: false, code: 'IPC_DENIED', message: '云端地址不得包含凭据' };
  }
  if (url.protocol === 'https:') {
    return { ok: true, origin: url.origin };
  }
  if (
    !options.packaged &&
    url.protocol === 'http:' &&
    LOCAL_DEV_HOSTS.has(url.hostname)
  ) {
    return { ok: true, origin: url.origin };
  }
  return {
    ok: false,
    code: 'IPC_DENIED',
    message: options.packaged ? '正式版只允许 https 云端地址' : '开发模式只允许本机 http 或 https',
  };
}

/**
 * Accept file:// (or null-origin file pages) and the expected local app origin.
 * Arbitrary https origins are denied.
 */
export function isAllowedIpcSenderOrigin(
  senderOrigin: string | null | undefined,
  expectedAppOrigins: readonly string[],
): boolean {
  if (!senderOrigin) return false;
  const normalized = senderOrigin === 'null' ? 'file://' : senderOrigin;
  for (const expected of expectedAppOrigins) {
    if (!expected) continue;
    if (isFileOrigin(expected) && isFileOrigin(normalized)) return true;
    try {
      if (new URL(normalized).origin === new URL(expected).origin) return true;
    } catch {
      /* invalid expected origin */
    }
  }
  return false;
}

function isFileOrigin(value: string): boolean {
  return value === 'file://' || value.startsWith('file:');
}
