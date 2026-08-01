/**
 * FunctionLayer：函数曲线、特征点与渐近线的增量投影。
 *
 * Task 6 阶段：曲线 handle 的创建/更新/删除 + staging/journal 应用，
 * 用注入的 board 接口（fake 或 JSXGraph）工作；特征点/渐近线随 Task 7 接入。
 */

/**
 * 以 record 创建函数曲线的 layer handle。
 * @param {any} board
 * @param {any} record
 * @param {{ resolve: (record: any) => any }} evaluator
 */
export function createFunctionLayerHandle(board, record, evaluator) {
  const evaluatorFn = evaluator.resolve(record);
  const curve = board.create(
    'functiongraph',
    [
      (x) => {
        const y = evaluatorFn(x);
        return y == null || !Number.isFinite(y) ? NaN : y;
      },
      -10,
      10,
    ],
    {
      strokeColor: record.color,
      strokeWidth: 2.4,
      visible: record.visible !== false,
      name: record.id,
    },
  );
  curve._mathFnId = record.id;
  const els = new Set([curve]);
  const handle = {
    id: record.id,
    record,
    els,
    evaluator: evaluatorFn,
    /** @param {any} nextRecord */
    update(nextRecord) {
      this.record = nextRecord;
      this.evaluator = evaluator.resolve(nextRecord);
      try {
        curve.setAttribute({
          strokeColor: nextRecord.color,
          visible: nextRecord.visible !== false,
          strokeWidth: 2.4,
        });
      } catch {
        /* partially disposed curve */
      }
    },
    /** @param {boolean} visible */
    setVisible(visible) {
      try {
        curve.setAttribute({ visible });
      } catch {
        /* partially disposed curve */
      }
    },
    dispose() {
      try {
        board.removeObject(curve);
      } catch {
        /* partially disposed board */
      }
      els.clear();
    },
  };
  return handle;
}

/** @param {any} registry @param {any[]} staged @param {any[]} removedJournal @param {any[]} updateJournal */
function rollback(registry, staged, removedJournal, updateJournal) {
  for (const { id, handle, previous } of updateJournal) {
    try {
      handle.update(previous);
    } catch {
      /* */
    }
  }
  for (const { id, handle } of removedJournal) {
    registry.set(id, handle);
  }
  for (const handle of staged) {
    try {
      handle.dispose();
    } catch {
      /* */
    }
    registry.delete(handle.id);
  }
}

/**
 * 函数 layer 的增量应用（staging/journal）：
 * 1. 先创建隐藏的新增 handle；
 * 2. 再执行 remove（记录 journal）；
 * 3. 再执行 update（记录 journal）；
 * 4. 全部成功才显示新增并 update board。
 *
 * 任一步失败：回滚 update/remove journal、销毁 staged handle，然后抛错，
 * 由 store 丢弃 candidate（history/persistence 看不到该 action）。
 *
 * @param {any} plan
 * @param {{ board: any, registry: any, evaluator: any }} context
 */
export function applyFunctionPlan(plan, context) {
  const { board, registry, evaluator } = context;

  // 1) stage adds（隐藏创建；任一失败即整体回滚）
  const staged = [];
  try {
    for (const record of plan.functions.add || []) {
      const handle = createFunctionLayerHandle(board, record, evaluator);
      handle.setVisible(false);
      registry.set(record.id, handle);
      staged.push(handle);
    }
  } catch (error) {
    for (const handle of staged) {
      try {
        handle.dispose();
      } catch {
        /* */
      }
      registry.delete(handle.id);
    }
    throw error;
  }

  // 2) remove（journal：失败时恢复）
  const removedJournal = [];
  for (const id of plan.functions.remove || []) {
    const handle = registry.get(id);
    if (handle) removedJournal.push({ id, handle });
    registry.delete(id);
  }

  // 3) update（journal：失败时恢复记录）
  const updateJournal = [];
  for (const { id, record } of plan.functions.update || []) {
    const handle = registry.get(id);
    if (!handle) continue;
    updateJournal.push({ id, handle, previous: handle.record });
    try {
      handle.update(record);
    } catch (error) {
      rollback(registry, staged, removedJournal, updateJournal);
      throw error;
    }
  }

  // 4) 显示新增并刷新
  for (const handle of staged) handle.setVisible(true);
  try {
    board.update?.();
  } catch {
    /* best-effort refresh */
  }
  return { ok: true };
}
