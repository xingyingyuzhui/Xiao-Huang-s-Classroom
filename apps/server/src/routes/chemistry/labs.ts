/**
 * 实验探究 CRUD API（B2 第十一批：route TS 权威源）。
 *
 * db 注入模式：db 查询与 seed/import-labs 函数（内部 require db）均由
 * 组合根注入——产物不 inline 服务链（避免 sql.js 双实例）。validateLab
 *（utils）无状态，经 tsup bundle。
 */
/* eslint-disable @typescript-eslint/no-require-imports -- utils JS 引用经 tsup bundle */
import { Router, type Request, type Response } from 'express';

const { success, error, badRequest, notFound } = require('../../utils/response') as {
  success: (res: Response, data?: unknown, message?: string) => Response;
  error: (res: Response, message?: string, status?: number) => Response;
  badRequest: (res: Response, message?: string) => Response;
  notFound: (res: Response, message?: string) => Response;
};
const { validateLab } = require('../../utils/lab-schema') as {
  validateLab: (raw: unknown) => { ok: boolean; reason?: string; lab?: Record<string, unknown> };
};

const LAB_PACK_FORMAT = 'xiaohuang-lab-pack';
const LAB_PACK_VERSION = 1;

/** 组合根注入：db 查询 + import-labs seed 函数（import-labs 权威源）。 */
export interface LabsRouterDeps {
  query: (sql: string, params?: unknown[]) => Array<Record<string, unknown>>;
  queryOne: (sql: string, params?: unknown[]) => Record<string, unknown> | null;
  run: (sql: string, params?: unknown[]) => unknown;
  runBatch: (fn: () => void) => unknown;
  ensureLabsSeeded: () => unknown;
  resetBuiltinLabs: () => Record<string, unknown>;
  resetOneBuiltin: (id: string) => Record<string, unknown> | null;
  listLabs: () => Array<Record<string, unknown>>;
  getLab: (id: string) => Record<string, unknown> | null;
  insertLab: (lab: Record<string, unknown>, now: number) => unknown;
  updateLabRow: (lab: Record<string, unknown>, now: number) => unknown;
  importLabsSafe: (labs: unknown[]) => {
    created?: number;
    renamed?: number;
    skipped?: number;
    errors?: string[];
    labs?: unknown[];
  };
  /** 内置实验数量（LABS_BUILTIN.length，组合根注入）。 */
  builtinCount: number;
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toPackLabs(labs: Array<Record<string, unknown>>) {
  return labs.map((l) => ({
    id: l.id,
    title: l.title,
    type: l.type,
    equation: l.equation,
    safety: l.safety,
    phenomena: l.phenomena,
    steps: l.steps,
    prestudy: l.prestudy,
    sortOrder: l.sortOrder,
    source: l.source,
  }));
}

export function createLabsRouter(deps: LabsRouterDeps): Router {
  const {
    query,
    queryOne,
    run,
    runBatch,
    ensureLabsSeeded,
    resetBuiltinLabs,
    resetOneBuiltin,
    listLabs,
    getLab,
    insertLab,
    updateLabRow,
    importLabsSafe,
    builtinCount,
  } = deps;
  const router = Router();

  // GET /api/labs
  router.get('/', (_req: Request, res: Response) => {
    try {
      const labs = listLabs();
      success(res, { labs, builtinCount });
    } catch (err) {
      console.error('labs list', err);
      error(res, err instanceof Error ? err.message : String(err) || '加载实验失败');
    }
  });

  // GET /api/labs/export
  router.get('/export', (_req: Request, res: Response) => {
    try {
      const labs = listLabs();
      success(res, {
        format: LAB_PACK_FORMAT,
        version: LAB_PACK_VERSION,
        exportedAt: new Date().toISOString(),
        labs: toPackLabs(labs),
      });
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  // POST /api/labs/import — 永不覆盖：冲突则新 ID + 标题「（导入）」；强制 custom
  router.post('/import', (req: Request, res: Response) => {
    try {
      ensureLabsSeeded();
      const data = (req.body || {}) as Record<string, unknown>;
      let labsIn: unknown = null;
      if (data?.format === LAB_PACK_FORMAT) {
        if (data.version !== LAB_PACK_VERSION) {
          badRequest(res, `不支持的实验包版本：${String(data.version)}`);
          return;
        }
        labsIn = data.labs;
      } else if (data?.format === 'xiaohuang-lesson-pack' && (data?.contents as { labs?: unknown } | null)?.labs) {
        labsIn = (data.contents as { labs?: unknown }).labs;
      } else if (Array.isArray(data?.labs)) {
        labsIn = data.labs;
      }
      if (!Array.isArray(labsIn) || !labsIn.length) {
        badRequest(res, '实验包中没有 labs 数组');
        return;
      }

      const result = importLabsSafe(labsIn);
      if (!result.created && result.skipped) {
        badRequest(res, result.errors?.[0] || '没有成功导入任何实验（数据未通过校验）');
        return;
      }
      success(res, {
        created: result.created,
        renamed: result.renamed,
        skipped: result.skipped,
        errors: result.errors,
        // 兼容旧前端字段名
        updated: 0,
        labs: result.labs,
      });
    } catch (err) {
      console.error('labs import', err);
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  // POST /api/labs/reset-builtin
  router.post('/reset-builtin', (_req: Request, res: Response) => {
    try {
      const result = resetBuiltinLabs();
      success(res, { ...result, labs: listLabs() });
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  // POST /api/labs/reorder  body: { ids: string[] } — 必须覆盖当前全部 id 且无重复
  router.post('/reorder', (req: Request, res: Response) => {
    try {
      ensureLabsSeeded();
      const ids = (req.body as { ids?: unknown } | null)?.ids;
      if (!Array.isArray(ids) || !ids.length) {
        badRequest(res, '需要 ids 数组');
        return;
      }

      const current = (query('SELECT id FROM lab_experiments') as Array<{ id: unknown }>).map(
        (r) => String(r.id),
      );
      const currentSet = new Set(current);
      if (ids.length !== current.length) {
        badRequest(res, `ids 数量须与实验总数一致（期望 ${current.length}，收到 ${ids.length}）`);
        return;
      }
      const seen = new Set<string>();
      for (const id of ids) {
        if (typeof id !== 'string' || !id) {
          badRequest(res, 'ids 含无效项');
          return;
        }
        if (seen.has(id)) {
          badRequest(res, `重复的 id：${id}`);
          return;
        }
        if (!currentSet.has(id)) {
          badRequest(res, `未知的 id：${id}`);
          return;
        }
        seen.add(id);
      }
      if (seen.size !== currentSet.size) {
        badRequest(res, 'ids 未覆盖全部实验');
        return;
      }

      const now = Date.now();
      runBatch(() => {
        ids.forEach((id, index) => {
          run('UPDATE lab_experiments SET sort_order = ?, updated_at = ? WHERE id = ?', [index, now, id]);
        });
      });
      success(res, { labs: listLabs() });
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  // GET /api/labs/:id
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const lab = getLab(String(req.params.id));
      if (!lab) {
        notFound(res, '实验不存在');
        return;
      }
      success(res, lab);
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  // POST /api/labs
  router.post('/', (req: Request, res: Response) => {
    try {
      ensureLabsSeeded();
      const checked = validateLab(req.body || {});
      if (!checked.ok || !checked.lab) {
        badRequest(res, checked.reason);
        return;
      }

      const maxRow = queryOne('SELECT MAX(sort_order) AS m FROM lab_experiments');
      const sortOrder =
        checked.lab.sortOrder != null && !Number.isNaN(Number(checked.lab.sortOrder))
          ? Number(checked.lab.sortOrder)
          : (Number((maxRow?.m as number | undefined) ?? 0) || 0) + 1;
      const now = Date.now();
      const body = (req.body || {}) as { id?: unknown };
      const id = body.id && String(body.id).trim() ? String(body.id).trim() : uid('lab');
      if (queryOne('SELECT id FROM lab_experiments WHERE id = ?', [id])) {
        badRequest(res, '实验 ID 已存在');
        return;
      }
      insertLab(
        {
          id,
          title: checked.lab.title,
          type: String(checked.lab.type || ''),
          equation: String(checked.lab.equation || ''),
          safety: String(checked.lab.safety || ''),
          phenomena: String(checked.lab.phenomena || ''),
          steps: Array.isArray(checked.lab.steps) ? checked.lab.steps : [],
          prestudy: checked.lab.prestudy ?? null,
          sortOrder,
          source: 'custom',
          createdAt: now,
          updatedAt: now,
        },
        now,
      );
      success(res, getLab(id));
    } catch (err) {
      console.error('labs create', err);
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  // PUT /api/labs/:id
  router.put('/:id', (req: Request, res: Response) => {
    try {
      const existing = getLab(String(req.params.id));
      if (!existing) {
        notFound(res, '实验不存在');
        return;
      }

      const body = (req.body || {}) as Record<string, unknown>;
      const mergedRaw = {
        title: body.title !== undefined ? body.title : existing.title,
        type: body.type !== undefined ? body.type : existing.type,
        equation: body.equation !== undefined ? body.equation : existing.equation,
        safety: body.safety !== undefined ? body.safety : existing.safety,
        phenomena: body.phenomena !== undefined ? body.phenomena : existing.phenomena,
        steps: body.steps !== undefined ? body.steps : existing.steps,
        prestudy: body.prestudy !== undefined ? body.prestudy : existing.prestudy,
        sortOrder: body.sortOrder !== undefined ? body.sortOrder : existing.sortOrder,
      };
      const checked = validateLab(mergedRaw);
      if (!checked.ok || !checked.lab) {
        badRequest(res, checked.reason);
        return;
      }

      const now = Date.now();
      // 任意手工修改 → custom（reset 接口单独写回 builtin）
      updateLabRow(
        {
          id: String(existing.id),
          title: checked.lab.title,
          type: String(checked.lab.type || ''),
          equation: String(checked.lab.equation || ''),
          safety: String(checked.lab.safety || ''),
          phenomena: String(checked.lab.phenomena || ''),
          steps: Array.isArray(checked.lab.steps) ? checked.lab.steps : [],
          prestudy: checked.lab.prestudy ?? null,
          sortOrder: checked.lab.sortOrder != null ? Number(checked.lab.sortOrder) : Number(existing.sortOrder),
          source: 'custom',
        },
        now,
      );
      success(res, getLab(String(req.params.id)));
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  // POST /api/labs/:id/reset
  router.post('/:id/reset', (req: Request, res: Response) => {
    try {
      const lab = resetOneBuiltin(String(req.params.id));
      if (!lab) {
        badRequest(res, '该实验不是内置项，无法重置');
        return;
      }
      success(res, lab);
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  // DELETE /api/labs/:id
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const existing = getLab(String(req.params.id));
      if (!existing) {
        notFound(res, '实验不存在');
        return;
      }
      run('DELETE FROM lab_experiments WHERE id = ?', [String(req.params.id)]);
      success(res, { deleted: true, id: req.params.id });
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  return router;
}
