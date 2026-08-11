import { z } from 'zod';
import {
  accountIdSchema,
  classIdSchema,
  deviceIdSchema,
  workspaceIdSchema,
} from './branded.js';

const subjectIdSchema = z.string().min(1).max(64);

/** Explicit workspace scope — no implicit "current class". */
export const workspaceScopeSchema = z.object({
  accountId: accountIdSchema.nullable(),
  classId: classIdSchema.nullable(),
  subjectId: subjectIdSchema,
  workspaceId: workspaceIdSchema,
  kind: z.enum(['guest', 'account', 'class', 'personal']),
});

export type WorkspaceScope = z.infer<typeof workspaceScopeSchema>;

export const workspaceContextSchema = workspaceScopeSchema.extend({
  mode: z.enum(['guest', 'authenticated']),
  deviceId: deviceIdSchema,
  generation: z.number().int().nonnegative(),
});

export type WorkspaceContext = z.infer<typeof workspaceContextSchema>;

export const workspaceSwitchRequestSchema = z.object({
  next: workspaceContextSchema,
  previousGeneration: z.number().int().nonnegative(),
});

export type WorkspaceSwitchRequest = z.infer<typeof workspaceSwitchRequestSchema>;
