/**
 * Settings 应用服务（Program 2 Task 2.7；C1 迁移为 TS 权威源）。
 *
 * 分层目标：route 只做 HTTP 适配，service 负责业务读取，返回
 * domain-core 的 Result + 稳定错误码（PERSISTENCE_*）。
 * Task 5.2 将把 DB 访问进一步下沉到 repository 接口。
 */
import { ok, err, AppError } from '@xiaohuang/domain-core';
import {
  createDefaultSubjectSettings,
  normalizeSubjectSettings,
} from '@xiaohuang/subject-settings';
import type { SubjectSettingsMap } from '@xiaohuang/subject-settings';

/** DB 查询形状（repository 接口的前置形态；Task 5.2 下沉）。 */
export interface SettingsDb {
  queryOne: (sql: string, params?: unknown[]) => { value: string } | null;
}

export type LoadSubjectSettingsResult =
  | { ok: true; value: SubjectSettingsMap }
  | { ok: false; error: AppError };

/** 读取 subjectSettings：无记录/非法 JSON 回退默认，DB 异常返回稳定错误码。 */
export function loadSubjectSettings(db: SettingsDb): LoadSubjectSettingsResult {
  try {
    const row = db.queryOne('SELECT value FROM settings WHERE key = ?', ['subjectSettings']);
    if (!row) return ok(normalizeSubjectSettings({}));
    let raw: unknown;
    try {
      raw = JSON.parse(row.value);
    } catch {
      return ok(normalizeSubjectSettings({}));
    }
    return ok(normalizeSubjectSettings(raw && typeof raw === 'object' ? raw : {}));
  } catch (dbError) {
    // 记录原始错误（不静默），对外只暴露稳定错误码
    console.error('[settings-service] 读取失败:', dbError);
    return err(new AppError('PERSISTENCE_READ', '设置读取失败', 'settings'));
  }
}

/** 默认设置（未落库时的权威基线；与 createDefaultSubjectSettings 同源）。 */
export function defaultSubjectSettings(): SubjectSettingsMap {
  return createDefaultSubjectSettings();
}
