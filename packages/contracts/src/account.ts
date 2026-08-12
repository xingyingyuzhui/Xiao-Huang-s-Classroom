import { z } from 'zod';
import { accountIdSchema } from './branded.js';

const displayNameSchema = z.string().min(1).max(120);

export const accountProfileSchema = z.object({
  accountId: accountIdSchema,
  displayName: displayNameSchema,
  avatarUrl: z.string().url().max(512).nullable(),
  email: z.string().email().max(254).nullable(),
  status: z.enum(['active', 'pending_deletion']),
  pendingDeletionAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const accountProfilePatchSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    avatarUrl: z.string().url().max(512).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'at least one field required');

export const accountPasswordChangeSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128),
});

export const accountDeletionRequestSchema = z.object({
  confirmDisplayName: displayNameSchema,
  currentPassword: z.string().min(8).max(128),
});

export const accountDeletionResponseSchema = z.object({
  accountId: accountIdSchema,
  pendingDeletionAt: z.string().datetime(),
});

export const accountDeletionCancelResponseSchema = z.object({
  accountId: accountIdSchema,
  restored: z.literal(true),
});

export const rememberedAccountCardSchema = z.object({
  accountId: accountIdSchema,
  displayName: displayNameSchema,
  avatarUrl: z.string().url().max(512).nullable(),
  lastUsedAt: z.string().datetime(),
  /** Vault reference only — never a token. */
  vaultRef: z.string().min(1).max(128),
});

export type AccountProfile = z.infer<typeof accountProfileSchema>;
export type RememberedAccountCard = z.infer<typeof rememberedAccountCardSchema>;
