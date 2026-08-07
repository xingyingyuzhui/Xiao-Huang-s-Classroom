import { z } from 'zod';

/**
 * 持久化 Schema（spec §7.1）：GraphDocumentV2 与设置。
 * 与 apps/web/src/math/graph/graph-document.js 的规范化输出对齐（V2 colorSlot/explicitColor）。
 */
export const GRAPH_DOCUMENT_VERSION = 2 as const;

const finite = z.number().refine(Number.isFinite, '必须是有限数');

export const graphFunctionRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(200),
  kind: z.enum(['preset', 'custom']),
  preset: z.string().optional(),
  expr: z.string().max(2000).optional(),
  coeffs: z.record(z.string(), finite).optional(),
  colorSlot: z.number().int().min(0).optional(),
  explicitColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{3,8}$/)
    .nullable()
    .optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  domain: z
    .object({ mode: z.literal('viewport') })
    .or(z.object({ mode: z.literal('custom'), min: finite, max: finite }))
    .optional(),
});

export const graphPointSchema = z.object({
  id: z.string().min(1),
  x: finite,
  y: finite,
  constraint: z.union([
    z.object({ kind: z.literal('free') }),
    z.object({
      kind: z.literal('followFunction'),
      functionId: z.string().min(1),
      anchorX: finite.optional(),
    }),
    z.object({
      kind: z.literal('followFeature'),
      functionId: z.string().min(1),
      feature: z.string().min(1),
    }),
    z.object({ kind: z.literal('intersection'), targetIds: z.array(z.string().min(1)).min(2) }),
  ]),
  showCoords: z.boolean().optional(),
  locked: z.boolean().optional(),
  style: z.record(z.string(), z.unknown()).optional(),
});

export const graphConstructionSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  pointIds: z.array(z.string().min(1)).optional(),
  fnId: z.string().optional(),
  fnIds: z.array(z.string()).optional(),
  extend: z.boolean().optional(),
  style: z.record(z.string(), z.unknown()).optional(),
});

export const graphDocumentSchema = z.object({
  schemaVersion: z.literal(GRAPH_DOCUMENT_VERSION),
  functions: z.array(graphFunctionRecordSchema).min(1, 'functions 永不为空'),
  points: z.array(graphPointSchema).default([]),
  constructions: z.array(graphConstructionSchema).default([]),
  view: z
    .object({
      xMin: finite,
      xMax: finite,
      yMin: finite,
      yMax: finite,
    })
    .partial()
    .optional(),
  presentation: z
    .object({
      activeFunctionId: z.string().nullable().optional(),
      compare: z.object({ reference: z.unknown() }).optional(),
    })
    .optional(),
  annotations: z
    .object({
      strokes: z.array(z.record(z.string(), z.unknown())).default([]),
    })
    .optional(),
});

export type GraphDocument = z.infer<typeof graphDocumentSchema>;
export type GraphFunctionRecord = z.infer<typeof graphFunctionRecordSchema>;
export type GraphPoint = z.infer<typeof graphPointSchema>;
export type GraphConstruction = z.infer<typeof graphConstructionSchema>;
