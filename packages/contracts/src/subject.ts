import { z } from 'zod';

/** Subject manifest Schema（spec §10.1）。 */
export const subjectManifestSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['ready', 'preview', 'locked']),
  intro: z.object({
    title: z.string(),
    description: z.string(),
    ctaLabel: z.string().optional(),
  }),
  cover: z.object({
    variants: z.array(z.string()).min(1),
  }),
  classroom: z.object({
    defaultPanel: z.string(),
    panels: z.array(z.string()).default([]),
  }),
});

export type SubjectManifest = z.infer<typeof subjectManifestSchema>;
