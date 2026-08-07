/**
 * Settings 应用服务（错误模型试点，Program 2 Task 2.7）。
 *
 * 分层目标：route 只做 HTTP 适配，service 负责业务读取，返回
 * domain-core 的 Result + 稳定错误码（PERSISTENCE_*）。
 * Task 5.2 将把 DB 访问进一步下沉到 repository 接口。
 */
const { ok, err } = require('@xiaohuang/domain-core');
const {
  createDefaultSubjectSettings,
  normalizeSubjectSettings,
} = require('@xiaohuang/subject-settings');

/**
 * @param {{ queryOne: (sql: string, params?: unknown[]) => { value: string } | null }} db
 * @returns {{ ok: true, value: Record<string, any> } | { ok: false, error: import('@xiaohuang/domain-core').AppError }}
 */
function loadSubjectSettings(db) {
  try {
    const row = db.queryOne('SELECT value FROM settings WHERE key = ?', ['subjectSettings']);
    if (!row) return ok(normalizeSubjectSettings({}));
    let raw;
    try {
      raw = JSON.parse(row.value);
    } catch {
      return ok(normalizeSubjectSettings({}));
    }
    return ok(normalizeSubjectSettings(raw && typeof raw === 'object' ? raw : {}));
  } catch (dbError) {
    // 记录原始错误（不静默），对外只暴露稳定错误码
    console.error('[settings-service] 读取失败:', dbError);
    return err(
      new (require('@xiaohuang/domain-core').AppError)(
        'PERSISTENCE_READ',
        '设置读取失败',
        'settings',
      ),
    );
  }
}

/** 默认设置（未落库时的权威基线；与 createDefaultSubjectSettings 同源）。 */
function defaultSubjectSettings() {
  return createDefaultSubjectSettings();
}

module.exports = { loadSubjectSettings, defaultSubjectSettings };
