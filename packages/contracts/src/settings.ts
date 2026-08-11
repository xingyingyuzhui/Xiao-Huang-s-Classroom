import { z } from 'zod';

/** Primitive setting values allowed in subject settings (no AI keys). */
const settingValueSchema = z.union([
  z.string().max(4096),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

/** Forbidden keys — AI credential and tokens live outside subject settings. */
const FORBIDDEN_SETTING_KEYS = new Set(['apiKey', 'refreshToken', 'accessToken', 'password']);

/** Per-subject settings map — AI credential lives in ai-provider contract only. */
export const subjectSettingEntrySchema = z
  .record(z.string().max(64), settingValueSchema)
  .superRefine((entry, ctx) => {
    for (const key of Object.keys(entry)) {
      if (FORBIDDEN_SETTING_KEYS.has(key)) {
        ctx.addIssue({ code: 'custom', message: `forbidden setting key: ${key}` });
      }
    }
  });

/** Settings keyed by subject id. */
export const subjectSettingsSchema = z.record(z.string().max(64), subjectSettingEntrySchema);

export type SubjectSettings = z.infer<typeof subjectSettingsSchema>;
