import { z } from 'zod';

/** 设置 Schema（spec §7.1）：与 packages/subject-settings 语义对齐的共享定义。 */
export const subjectSettingsSchema = z.record(z.string(), z.record(z.string(), z.unknown()));

export type SubjectSettings = z.infer<typeof subjectSettingsSchema>;
