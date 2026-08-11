import { z } from 'zod';
import { accountIdSchema, classIdSchema, workspaceIdSchema } from './branded.js';

const classNameSchema = z.string().min(1).max(120);

export const classRecordSchema = z.object({
  id: classIdSchema,
  accountId: accountIdSchema,
  name: classNameSchema,
  archived: z.boolean(),
  deletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const classCreateRequestSchema = z.object({
  name: classNameSchema,
});

export const classPatchRequestSchema = z.object({
  name: classNameSchema.optional(),
  archived: z.boolean().optional(),
});

export const classCopyRequestSchema = z.object({
  name: classNameSchema,
  includeProgress: z.boolean().optional(),
});

export const classSubjectWorkspaceSchema = z.object({
  id: workspaceIdSchema,
  classId: classIdSchema.nullable(),
  accountId: accountIdSchema,
  subjectId: z.string().min(1).max(64),
  kind: z.enum(['personal', 'class']),
});

export const studentRosterEntrySchema = z.object({
  id: z.string().min(1).max(64),
  displayName: z.string().min(1).max(64),
  sortOrder: z.number().int().nonnegative(),
  enabled: z.boolean(),
});

export type ClassRecord = z.infer<typeof classRecordSchema>;
export type StudentRosterEntry = z.infer<typeof studentRosterEntrySchema>;
