import { z } from 'zod';
import {
  accountIdSchema,
  deviceIdSchema,
  sessionIdSchema,
} from './branded.js';

const usernameSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, 'username contains invalid characters');

const passwordSchema = z.string().min(8).max(128);

const displayNameSchema = z.string().min(1).max(120);

export const registrationModeSchema = z.enum(['closed', 'invite', 'public']);

export const authRegisterRequestSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  inviteCode: z.string().min(1).max(64).optional(),
});

export const authLoginRequestSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  deviceLabel: z.string().min(1).max(120),
});

export const authRefreshRequestSchema = z.object({
  deviceId: deviceIdSchema,
});

export const authLogoutRequestSchema = z.object({
  deviceId: deviceIdSchema,
  allDevices: z.boolean().optional(),
});

export const authSessionSchema = z.object({
  accountId: accountIdSchema,
  sessionId: sessionIdSchema,
  deviceId: deviceIdSchema,
  accessTokenExpiresAt: z.string().datetime(),
});

export const authCurrentAccountSchema = z.object({
  accountId: accountIdSchema,
  displayName: displayNameSchema,
  avatarUrl: z.string().url().max(512).nullable(),
  registrationMode: registrationModeSchema,
  pendingDeletionAt: z.string().datetime().nullable(),
});

export const deviceSessionSchema = z.object({
  sessionId: sessionIdSchema,
  deviceId: deviceIdSchema,
  label: z.string().min(1).max(120),
  lastSeenAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  current: z.boolean(),
});

export const deviceRevokeRequestSchema = z.object({
  sessionId: sessionIdSchema,
});

export type AuthRegisterRequest = z.infer<typeof authRegisterRequestSchema>;
export type AuthLoginRequest = z.infer<typeof authLoginRequestSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
export type AuthCurrentAccount = z.infer<typeof authCurrentAccountSchema>;
export type DeviceSession = z.infer<typeof deviceSessionSchema>;
