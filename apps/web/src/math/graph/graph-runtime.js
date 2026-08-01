/**
 * GraphRuntime：JSXGraph runtime registry，不可序列化。
 *
 * 职责：按文档 id 管理 layer handle（els/disposers/evaluator/dependencyIds），
 * 提供 get/set/delete/clear；文档本身永不写入 board/element。
 */
