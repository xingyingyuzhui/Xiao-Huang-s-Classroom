/**
 * 分层错误边界（spec §9.3）：
 * - boot：应用启动失败（致命）。
 * - classroom：单个课堂失败不影响大厅/其它课堂。
 * - panel：单面板失败只影响本面板。
 * - rendererFatal：文档一致性受损 → 明确只读状态。
 */
export const BOUNDARY_LEVELS = ['boot', 'classroom', 'panel', 'rendererFatal'];

export function createErrorBoundary({ onFatal, onClassroomError, onPanelError }) {
  const errors = new Map();

  function report(level, scope, err) {
    const entry = { level, scope, error: err, at: Date.now() };
    errors.set(`${level}:${scope}`, entry);
    if (level === 'boot') {
      onFatal?.(entry);
    } else if (level === 'classroom') {
      onClassroomError?.(entry);
    } else {
      onPanelError?.(entry);
    }
    return entry;
  }

  return {
    /** 捕获面板级错误（不级联到课堂/大厅） */
    panel(scope, fn) {
      try {
        return fn();
      } catch (err) {
        return report('panel', scope, err);
      }
    },
    classroom(scope, fn) {
      try {
        return fn();
      } catch (err) {
        return report('classroom', scope, err);
      }
    },
    /** renderer fatal：进入只读（由调用方禁用工具输入） */
    rendererFatal(scope, err) {
      return report('rendererFatal', scope, err);
    },
    boot(scope, err) {
      return report('boot', scope, err);
    },
    getErrors: () => [...errors.values()],
    clear(level) {
      for (const key of [...errors.keys()]) {
        if (level === undefined || key.startsWith(`${level}:`)) errors.delete(key);
      }
    },
  };
}
