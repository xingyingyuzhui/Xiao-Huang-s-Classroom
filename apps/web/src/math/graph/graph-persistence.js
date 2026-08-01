/**
 * GraphPersistence：自动保存、恢复与安全导入导出。
 *
 * 职责：localStorage debounce、容量/深度/危险键限制、import/export、重置。
 * 纯逻辑层：storage 由调用方注入，不直接触碰浏览器全局。
 *
 * 后续 Task 将在此实现：
 * - createGraphPersistence({ storage, key, wait, now, eventTarget })
 */
