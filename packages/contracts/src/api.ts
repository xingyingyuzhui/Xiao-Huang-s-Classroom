import { z } from 'zod';

/**
 * API 合同（spec §11.2）：v2 规范响应与 v1 兼容字段。
 * v1 只做 URL/状态码/字段冻结；v2 统一 { success, data|error, requestId }。
 */
export const apiErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
  scope: z.string().optional(),
});

export const apiResponseSchema = z.union([
  z.object({ success: z.literal(true), data: z.unknown(), requestId: z.string() }),
  z.object({ success: z.literal(false), error: apiErrorPayloadSchema, requestId: z.string() }),
]);

export type ApiResponse<T = unknown> =
  | { success: true; data: T; requestId: string }
  | { success: false; error: z.infer<typeof apiErrorPayloadSchema>; requestId: string };

export function parseApiResponse<T>(raw: unknown, dataSchema: z.ZodType<T>): ApiResponse<T> {
  const parsed = apiResponseSchema.safeParse(raw);
  if (!parsed.success)
    return {
      success: false,
      error: { code: 'INTERNAL_UNKNOWN', message: '响应不符合 API 合同' },
      requestId: '',
    };
  if (parsed.data.success) {
    const data = dataSchema.safeParse(parsed.data.data);
    if (!data.success) {
      return {
        success: false,
        error: { code: 'VALIDATION_SCHEMA', message: 'data 不符合 schema' },
        requestId: parsed.data.requestId,
      };
    }
    return { success: true, data: data.data, requestId: parsed.data.requestId };
  }
  return parsed.data;
}
