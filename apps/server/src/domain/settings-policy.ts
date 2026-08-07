/**
 * Settings domain policy（R5.1/R8 B1 首批）：纯业务规则，无副作用、无依赖。
 * 与 route/service 解耦；tsup 构建 CJS 供 service require。
 */
export const MAX_ICON_DATA_URL = 700 * 1024;
export const MAX_TITLE_LENGTH = 80;

/** 图标 URL 校验：仅 data:image/(png|jpeg|jpg|webp|gif);base64 且不超限。 */
export function validateIconDataUrl(url: unknown): string | null {
  if (url == null || url === '') return null;
  const s = String(url);
  if (s.length > MAX_ICON_DATA_URL) {
    throw new Error('图标过大（请压缩到约 500KB 以内）');
  }
  if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(s)) {
    throw new Error('图标格式无效（仅支持 png/jpeg/webp/gif data URL）');
  }
  return s;
}

/** 标题长度限制。 */
export function normalizeTitle(title: unknown): string {
  return String(title ?? '').slice(0, MAX_TITLE_LENGTH);
}

/** API 掩码判定（前端回显的掩码值不可再写入明文）。 */
export function isMaskedKey(key: unknown): boolean {
  if (typeof key !== 'string' || !key) return false;
  if (key === '__MASKED_API_KEY__') return true;
  return /^.{1,8}\*\*\*.{0,8}$/.test(key) && key.includes('***');
}

/** API Key 掩码（展示用）。 */
export function maskApiKey(key: unknown): string {
  if (!key) return '__MASKED_API_KEY__';
  if (typeof key !== 'string') return '__MASKED_API_KEY__';
  if (key.length < 10) return '__MASKED_API_KEY__';
  return key.slice(0, 4) + '***' + key.slice(-2);
}
