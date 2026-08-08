/**
 * 配平脚本 CRUD API（B2 第十四批：route TS 权威源）。
 *
 * db 注入模式：db 查询与 import-balance-scripts 函数（内部 require db）
 * 均由组合根注入。validateBalanceScript（utils）无状态 bundle。
 */
/* eslint-disable @typescript-eslint/no-require-imports -- utils JS 引用经 tsup bundle */
import { Router, type Request, type Response } from 'express';

const { success, error, badRequest, notFound } = require('../../utils/response') as {
  success: (res: Response, data?: unknown, message?: string) => Response;
  error: (res: Response, message?: string, status?: number) => Response;
  badRequest: (res: Response, message?: string) => Response;
  notFound: (res: Response, message?: string) => Response;
};
const { validateBalanceScript } = require('../../utils/balance-script-schema') as {
  validateBalanceScript: (raw: unknown) => {
    ok: boolean;
    reason?: string;
    script?: Record<string, unknown>;
  };
};

const BALANCE_PACK_FORMAT = 'xiaohuang-balance-pack';
const BALANCE_PACK_VERSION = 1;

/** 组合根注入：db 查询 + import-balance-scripts 函数（权威源）。 */
export interface BalanceScriptsRouterDeps {
  query: (sql: string, params?: unknown[]) => Array<Record<string, unknown>>;
  queryOne: (sql: string, params?: unknown[]) => Record<string, unknown> | null;
  run: (sql: string, params?: unknown[]) => unknown;
  runBatch: (fn: () => void) => unknown;
  ensureBalanceScriptsSeeded: () => unknown;
  resetOneBuiltin: (id: string) => Record<string, unknown> | null;
  listScripts: () => Array<Record<string, unknown>>;
  getScript: (id: string) => Record<string, unknown> | null;
  insertScript: (script: Record<string, unknown>, now: number) => unknown;
  updateScriptRow: (script: Record<string, unknown>, now: number) => unknown;
  toPackScripts: (scripts: Array<Record<string, unknown>>) => unknown;
  importBalanceScriptsSafe: (scripts: unknown[]) => {
    created?: number;
    renamed?: number;
    skipped?: number;
    errors?: string[];
    scripts?: unknown[];
  };
  /** 内置脚本数量（BALANCE_BUILTIN.length，组合根注入）。 */
  builtinCount: number;
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createBalanceScriptsRouter(deps: BalanceScriptsRouterDeps): Router {
  const {
    query,
    queryOne,
    run,
    runBatch,
    ensureBalanceScriptsSeeded,
    resetOneBuiltin,
    listScripts,
    getScript,
    insertScript,
    updateScriptRow,
    toPackScripts,
    importBalanceScriptsSafe,
    builtinCount,
  } = deps;
  const router = Router();

  // GET /api/balance-scripts
  router.get('/', (_req: Request, res: Response) => {
    try {
      const scripts = listScripts();
      success(res, { scripts, builtinCount });
    } catch (err) {
      console.error('balance-scripts list', err);
      error(res, err instanceof Error ? err.message : String(err) || '加载配平脚本失败');
    }
  });

  // GET /api/balance-scripts/export — 必须在 /:id 之前
  router.get('/export', (_req: Request, res: Response) => {
    try {
      const scripts = listScripts();
      success(res, {
        format: BALANCE_PACK_FORMAT,
        version: BALANCE_PACK_VERSION,
        exportedAt: new Date().toISOString(),
        scripts: toPackScripts(scripts),
      });
    } catch (err) {
      console.error('balance-scripts export', err);
      error(res, err instanceof Error ? err.message : String(err) || '导出失败');
    }
  });

  // POST /api/balance-scripts/import — 永不覆盖；冲突新 id +「（导入）」
  router.post('/import', (req: Request, res: Response) => {
    try {
      ensureBalanceScriptsSeeded();
      const data = req.body as Record<string, unknown> | unknown[];
      let scriptsIn: unknown = null;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const d = data as { format?: unknown; version?: unknown; scripts?: unknown };
        if (d.format === BALANCE_PACK_FORMAT) {
          if (d.version !== BALANCE_PACK_VERSION) {
            badRequest(res, `不支持的配平包版本：${String(d.version)}`);
            return;
          }
          scriptsIn = d.scripts;
        } else if (Array.isArray(d.scripts)) {
          scriptsIn = d.scripts;
        }
      } else if (Array.isArray(data)) {
        scriptsIn = data;
      }
      if (!Array.isArray(scriptsIn) || !scriptsIn.length) {
        badRequest(res, '配平包中没有 scripts 数组');
        return;
      }

      const result = importBalanceScriptsSafe(scriptsIn);
      if (!result.created && result.skipped) {
        badRequest(res, result.errors?.[0] || '没有成功导入任何脚本（数据未通过校验）');
        return;
      }
      success(res, {
        created: result.created,
        renamed: result.renamed,
        skipped: result.skipped,
        errors: result.errors,
        scripts: result.scripts,
      });
    } catch (err) {
      console.error('balance-scripts import', err);
      error(res, err instanceof Error ? err.message : String(err) || '导入失败');
    }
  });

  // POST /api/balance-scripts/reorder  body: { ids: string[] } — 与实验探究 labs/reorder 对齐
  router.post('/reorder', (req: Request, res: Response) => {
    try {
      ensureBalanceScriptsSeeded();
      const ids = (req.body as { ids?: unknown } | null)?.ids;
      if (!Array.isArray(ids) || !ids.length) {
        badRequest(res, '需要 ids 数组');
        return;
      }

      const current = (query('SELECT id FROM balance_scripts') as Array<{ id: unknown }>).map(
        (r) => String(r.id),
      );
      const currentSet = new Set(current);
      if (ids.length !== current.length) {
        badRequest(res, `ids 数量须与脚本总数一致（期望 ${current.length}，收到 ${ids.length}）`);
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
        badRequest(res, 'ids 未覆盖全部脚本');
        return;
      }

      const now = Date.now();
      runBatch(() => {
        ids.forEach((id, index) => {
          run('UPDATE balance_scripts SET sort_order = ?, updated_at = ? WHERE id = ?', [index, now, id]);
        });
      });
      success(res, { scripts: listScripts() });
    } catch (err) {
      console.error('balance-scripts reorder', err);
      error(res, err instanceof Error ? err.message : String(err) || '排序失败');
    }
  });

  // GET /api/balance-scripts/:id
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const script = getScript(String(req.params.id));
      if (!script) {
        notFound(res, '配平脚本不存在');
        return;
      }
      success(res, script);
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  // POST /api/balance-scripts
  router.post('/', (req: Request, res: Response) => {
    try {
      ensureBalanceScriptsSeeded();
      const checked = validateBalanceScript(req.body || {});
      if (!checked.ok || !checked.script) {
        badRequest(res, checked.reason);
        return;
      }

      const maxRow = queryOne('SELECT MAX(sort_order) AS m FROM balance_scripts');
      const sortOrder = (Number((maxRow?.m as number | undefined) ?? 0) || 0) + 1;
      const now = Date.now();
      const body = (req.body || {}) as { id?: unknown };
      const id = body.id && String(body.id).trim() ? String(body.id).trim() : uid('bs');
      if (queryOne('SELECT id FROM balance_scripts WHERE id = ?', [id])) {
        badRequest(res, '配平脚本 ID 已存在');
        return;
      }
      insertScript(
        {
          id,
          title: checked.script.title,
          grade: String(checked.script.grade || ''),
          difficulty: String(checked.script.difficulty || ''),
          startEquation: checked.script.startEquation,
          targetEquation: checked.script.targetEquation,
          species: checked.script.species,
          steps: checked.script.steps,
          sortOrder,
          source: 'custom',
          createdAt: now,
          updatedAt: now,
        },
        now,
      );
      success(res, getScript(id));
    } catch (err) {
      console.error('balance-scripts create', err);
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  // PUT /api/balance-scripts/:id
  router.put('/:id', (req: Request, res: Response) => {
    try {
      const existing = getScript(String(req.params.id));
      if (!existing) {
        notFound(res, '配平脚本不存在');
        return;
      }

      const body = (req.body || {}) as Record<string, unknown>;
      const mergedRaw = {
        title: body.title !== undefined ? body.title : existing.title,
        grade: body.grade !== undefined ? body.grade : existing.grade,
        difficulty: body.difficulty !== undefined ? body.difficulty : existing.difficulty,
        startEquation: body.startEquation !== undefined ? body.startEquation : existing.startEquation,
        targetEquation: body.targetEquation !== undefined ? body.targetEquation : existing.targetEquation,
        species: body.species !== undefined ? body.species : existing.species,
        steps: body.steps !== undefined ? body.steps : existing.steps,
      };
      const checked = validateBalanceScript(mergedRaw);
      if (!checked.ok || !checked.script) {
        badRequest(res, checked.reason);
        return;
      }

      const now = Date.now();
      updateScriptRow(
        {
          id: String(existing.id),
          title: checked.script.title,
          grade: String(checked.script.grade || ''),
          difficulty: String(checked.script.difficulty || ''),
          startEquation: checked.script.startEquation,
          targetEquation: checked.script.targetEquation,
          species: checked.script.species,
          steps: checked.script.steps,
          sortOrder: existing.sortOrder,
          source: 'custom',
        },
        now,
      );
      success(res, getScript(String(req.params.id)));
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  // POST /api/balance-scripts/:id/reset
  router.post('/:id/reset', (req: Request, res: Response) => {
    try {
      const script = resetOneBuiltin(String(req.params.id));
      if (!script) {
        badRequest(res, '该脚本不是内置项，无法重置');
        return;
      }
      success(res, script);
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  // DELETE /api/balance-scripts/:id
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const existing = getScript(String(req.params.id));
      if (!existing) {
        notFound(res, '配平脚本不存在');
        return;
      }
      run('DELETE FROM balance_scripts WHERE id = ?', [req.params.id]);
      success(res, { deleted: true, id: req.params.id });
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  return router;
}
