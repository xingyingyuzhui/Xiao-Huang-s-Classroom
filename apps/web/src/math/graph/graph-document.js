/**
 * GraphDocumentV1：函数画布唯一业务数据源。
 *
 * 职责：默认文档、深度规范化、校验、可序列化克隆与错误对象。
 * 纯逻辑层：不 import 画板库，不触碰浏览器全局，不持有 runtime 字段。
 *
 * 后续 Task 将在此实现：
 * - createDefaultGraphDocument
 * - normalizeGraphDocument / validateGraphDocument
 * - toSerializableGraphDocument / hydrateGraphDocument
 */
