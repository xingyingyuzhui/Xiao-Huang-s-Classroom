import { z } from 'zod';

const themeIdSchema = z.string().min(1).max(64);

/** Teacher device + subject settings synced as `teacher.settings`. Secrets must not appear. */
export const teacherSettingsPayloadSchema = z.object({
  theme: z
    .object({
      id: themeIdSchema,
    })
    .passthrough()
    .optional(),
  subjectSettings: z.record(z.string().max(64), z.unknown()).optional(),
});

export const classSettingsPayloadSchema = z.object({
  className: z.string().min(1).max(120).optional(),
});

export const classRosterStudentSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
});

export const classRosterPayloadSchema = z.object({
  students: z.array(classRosterStudentSchema).max(2000),
});

export type TeacherSettingsPayload = z.infer<typeof teacherSettingsPayloadSchema>;
export type ClassSettingsPayload = z.infer<typeof classSettingsPayloadSchema>;
export type ClassRosterPayload = z.infer<typeof classRosterPayloadSchema>;
