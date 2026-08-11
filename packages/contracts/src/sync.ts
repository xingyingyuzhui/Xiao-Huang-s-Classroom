import { z } from 'zod';
import {
  operationIdSchema,
  resourceIdSchema,
  syncCursorSchema,
  workspaceIdSchema,
} from './branded.js';

const resourceTypeSchema = z.string().min(1).max(64);
const revisionSchema = z.number().int().nonnegative();
const contentHashSchema = z.string().min(8).max(128);

export const syncEntityEnvelopeSchema = z.object({
  resourceType: resourceTypeSchema,
  resourceId: resourceIdSchema,
  workspaceId: workspaceIdSchema,
  schemaVersion: z.number().int().positive(),
  revision: revisionSchema,
  baseRevision: revisionSchema.nullable(),
  payload: z.unknown(),
  contentHash: contentHashSchema,
  deletedAt: z.string().datetime().nullable(),
});

export type SyncEntityEnvelope = z.infer<typeof syncEntityEnvelopeSchema>;

export const syncOperationSchema = z.object({
  operationId: operationIdSchema,
  envelope: syncEntityEnvelopeSchema,
});

export type SyncOperation = z.infer<typeof syncOperationSchema>;

const conflictSummarySchema = z.object({
  resourceType: resourceTypeSchema,
  resourceId: resourceIdSchema,
  localSummary: z.string().max(256),
  cloudSummary: z.string().max(256),
  baseSummary: z.string().max(256).nullable(),
});

export const syncPushRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  operations: z.array(syncOperationSchema).max(200),
});

export const syncPushResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('applied'), operationId: operationIdSchema }),
  z.object({
    status: z.literal('rejected'),
    operationId: operationIdSchema,
    code: z.string().max(64),
    message: z.string().max(256),
  }),
  z.object({
    status: z.literal('conflict'),
    operationId: operationIdSchema,
    conflict: conflictSummarySchema,
  }),
]);

export const syncPushResponseSchema = z.object({
  applied: z.array(operationIdSchema),
  rejected: z.array(
    z.object({
      operationId: operationIdSchema,
      code: z.string().max(64),
      message: z.string().max(256),
    }),
  ),
  conflicts: z.array(
    z.object({
      operationId: operationIdSchema,
      conflict: conflictSummarySchema,
    }),
  ),
  requestId: z.string().min(1).max(64),
});

export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>;

export const syncPullRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  cursor: syncCursorSchema.nullable(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const syncPullChangeSchema = z.object({
  resourceType: resourceTypeSchema,
  resourceId: resourceIdSchema,
  revision: revisionSchema,
  schemaVersion: z.number().int().positive(),
  payload: z.unknown(),
  contentHash: contentHashSchema,
  deletedAt: z.string().datetime().nullable(),
});

export const syncPullResponseSchema = z.object({
  cursor: syncCursorSchema,
  sequence: z.number().int().nonnegative(),
  changes: z.array(syncPullChangeSchema),
  hasMore: z.boolean(),
  requestId: z.string().min(1).max(64),
});

export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>;

export const conflictResolutionSchema = z.enum(['keepLocal', 'keepCloud', 'duplicateLocal']);
