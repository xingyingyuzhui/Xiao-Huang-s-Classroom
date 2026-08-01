/**
 * GraphRuntime：JSXGraph runtime registry，不可序列化。
 *
 * 职责：按文档 id 管理 layer handle（els/disposers/evaluator/dependencyIds），
 * 提供 get/set/delete/clear；文档本身永不写入 board/element。
 *
 * Task 2 阶段先提供 { curve, evaluator } sidecar；Phase 2 扩展为完整 layer handle。
 */

import { createFunctionEvaluatorCache } from './function-evaluator.js';

/**
 * @returns {{ curve: any, evaluator: ReturnType<typeof createFunctionEvaluatorCache> }}
 */
export function createGraphRuntimeSidecar() {
  return {
    curve: null,
    evaluator: createFunctionEvaluatorCache(),
  };
}
