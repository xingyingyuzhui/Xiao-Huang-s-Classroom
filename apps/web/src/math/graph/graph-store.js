/**
 * GraphStore：纯 reducer + 两阶段发布 store。
 *
 * 职责：action 规约、不可变文档更新、级联删除、事务 preview/commit/cancel。
 * 纯逻辑层：不 import 画板库，不触碰浏览器全局。
 *
 * 后续 Task 将在此实现：
 * - reduceGraphDocument(document, action)
 * - createGraphStore(initialDocument, { beforeCommit })
 */
