import { z } from 'zod';

/** Branded string IDs shared across account/cloud contracts. */
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export const brandedIdSchema = (label: string) =>
  z
    .string()
    .min(1)
    .max(128)
    .regex(idPattern, `${label} id format invalid`);

export const accountIdSchema = brandedIdSchema('AccountId');
export const classIdSchema = brandedIdSchema('ClassId');
export const workspaceIdSchema = brandedIdSchema('WorkspaceId');
export const deviceIdSchema = brandedIdSchema('DeviceId');
export const sessionIdSchema = brandedIdSchema('SessionId');
export const resourceIdSchema = brandedIdSchema('ResourceId');
export const operationIdSchema = brandedIdSchema('OperationId');
export const syncCursorSchema = brandedIdSchema('SyncCursor');

export type AccountId = z.infer<typeof accountIdSchema>;
export type ClassId = z.infer<typeof classIdSchema>;
export type WorkspaceId = z.infer<typeof workspaceIdSchema>;
export type DeviceId = z.infer<typeof deviceIdSchema>;
export type SessionId = z.infer<typeof sessionIdSchema>;
export type ResourceId = z.infer<typeof resourceIdSchema>;
export type OperationId = z.infer<typeof operationIdSchema>;
export type SyncCursor = z.infer<typeof syncCursorSchema>;
