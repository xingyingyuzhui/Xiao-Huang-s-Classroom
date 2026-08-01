/**
 * GraphHistory：有界、可合并的撤销/重做历史。
 *
 * 职责：undo/redo、事务合并、250ms 视口静默合并、上限裁剪。
 * 纯逻辑层：不 import 画板库，不触碰浏览器全局；历史自身不持久化。
 *
 * 后续 Task 将在此实现：
 * - createGraphHistory(store, { limit })
 */
