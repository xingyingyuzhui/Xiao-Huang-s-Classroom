import { z } from 'zod';
import { accountIdSchema } from './branded.js';

export const aiProviderKindSchema = z.enum(['openai-compatible']);

export const aiCredentialMetadataSchema = z.object({
  accountId: accountIdSchema,
  provider: aiProviderKindSchema,
  model: z.string().min(1).max(128),
  configured: z.boolean(),
  last4: z.string().length(4).nullable(),
  updatedAt: z.string().datetime().nullable(),
});

/** PUT body — key present only on write; never returned on GET. */
export const aiCredentialUpsertSchema = z.object({
  provider: aiProviderKindSchema,
  model: z.string().min(1).max(128),
  apiKey: z.string().min(8).max(512),
});

export const aiUsageQuotaSchema = z.object({
  dailyUsed: z.number().int().nonnegative(),
  dailyLimit: z.number().int().nonnegative(),
  monthlyUsed: z.number().int().nonnegative(),
  monthlyLimit: z.number().int().nonnegative(),
});

export type AiCredentialMetadata = z.infer<typeof aiCredentialMetadataSchema>;
export type AiUsageQuota = z.infer<typeof aiUsageQuotaSchema>;
