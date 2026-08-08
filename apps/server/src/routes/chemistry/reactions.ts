/**
 * 化学反应 CRUD API（B2 第十批：route TS 权威源）。
 *
 * db 注入模式：query/queryOne/run 由组合根注入；insertReaction/
 * rowFromReaction（seed 模块，内部 require db）同样注入——产物不
 * inline 服务链。utils（response）无状态 bundle。
 */
/* eslint-disable @typescript-eslint/no-require-imports -- utils JS 引用经 tsup bundle */
import { Router, type Request, type Response } from 'express';

const { success, error, badRequest, notFound } = require('../../utils/response') as {
  success: (res: Response, data?: unknown, message?: string) => Response;
  error: (res: Response, message?: string, status?: number) => Response;
  badRequest: (res: Response, message?: string) => Response;
  notFound: (res: Response, message?: string) => Response;
};

/** 组合根注入：db 查询 + seed 反应写入（import-reactions 权威源）。 */
export interface ReactionsRouterDeps {
  query: (sql: string, params?: unknown[]) => Array<Record<string, unknown>>;
  queryOne: (sql: string, params?: unknown[]) => Record<string, unknown> | null;
  run: (sql: string, params?: unknown[]) => unknown;
  insertReaction: (row: Record<string, unknown>) => unknown;
  rowFromReaction: (reaction: Record<string, unknown>, source: string) => Record<string, unknown>;
}

function parseJson(str: unknown, fallback: unknown): unknown {
  try {
    return JSON.parse(String(str || ''));
  } catch {
    return fallback;
  }
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    equation: row.equation,
    reactants: parseJson(row.reactants_json, []),
    products: parseJson(row.products_json, []),
    conditions: row.conditions,
    phenomena: row.phenomena,
    notes: row.notes,
    steps: parseJson(row.steps_json, []),
    moleculeIds: parseJson(row.molecule_ids_json, []),
    source: row.source,
    createdAt: row.created_at,
  };
}

export function createReactionsRouter(deps: ReactionsRouterDeps): Router {
  const { query, queryOne, run, insertReaction, rowFromReaction } = deps;
  const router = Router();

  /**
   * GET /api/reactions
   * ?moleculeId=c2h4  筛选与该分子相关的反应
   */
  router.get('/', (req: Request, res: Response) => {
    try {
      const { moleculeId } = req.query as { moleculeId?: unknown };
      const rows = query(
        'SELECT * FROM chem_reactions ORDER BY source ASC, created_at ASC',
      );
      const list = rows.map(mapRow);
      if (moleculeId && String(moleculeId).trim()) {
        const mid = String(moleculeId).trim();
        const filtered = list.filter((r) => {
          const mols = r.moleculeIds as unknown[] | undefined;
          if ((mols || []).includes(mid)) return true;
          const inR = ((r.reactants as Array<{ moleculeId?: unknown }> | undefined) || []).some(
            (x) => x.moleculeId === mid,
          );
          const inP = ((r.products as Array<{ moleculeId?: unknown }> | undefined) || []).some(
            (x) => x.moleculeId === mid,
          );
          return inR || inP;
        });
        success(res, filtered);
        return;
      }
      success(res, list);
    } catch (err) {
      console.error(err);
      error(res, '获取反应列表失败');
    }
  });

  router.get('/:id', (req: Request, res: Response) => {
    try {
      const row = queryOne('SELECT * FROM chem_reactions WHERE id = ?', [
        req.params.id,
      ]);
      if (!row) {
        notFound(res, '反应不存在');
        return;
      }
      success(res, mapRow(row));
    } catch (err) {
      console.error(err);
      error(res, '获取反应失败');
    }
  });

  /**
   * POST /api/reactions
   * 保存 AI 生成的反应（确认后入库）
   */
  router.post('/', (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      if (!body.title || !body.equation) {
        badRequest(res, '标题和方程式不能为空');
        return;
      }
      const id =
        body.id && String(body.id).trim()
          ? String(body.id).trim()
          : `rxn-ai-${Date.now().toString(36)}`;
      const existing = queryOne('SELECT id FROM chem_reactions WHERE id = ?', [
        id,
      ]);
      if (existing) {
        badRequest(res, '反应 id 已存在');
        return;
      }

      const moleculeIds: unknown[] = Array.isArray(body.moleculeIds) ? body.moleculeIds : [];
      // 从 reactants/products 收集 moleculeId
      for (const side of [body.reactants, body.products]) {
        if (!Array.isArray(side)) continue;
        (side as Array<{ moleculeId?: unknown }>).forEach((x) => {
          if (x?.moleculeId && !moleculeIds.includes(x.moleculeId)) {
            moleculeIds.push(x.moleculeId);
          }
        });
      }

      const reaction = {
        id,
        title: String(body.title).slice(0, 80),
        type: String(body.type || '其他').slice(0, 20),
        equation: String(body.equation).slice(0, 200),
        reactants: Array.isArray(body.reactants) ? body.reactants : [],
        products: Array.isArray(body.products) ? body.products : [],
        conditions: String(body.conditions || '').slice(0, 200),
        phenomena: String(body.phenomena || '').slice(0, 200),
        notes: String(body.notes || '').slice(0, 400),
        steps: Array.isArray(body.steps) ? body.steps.slice(0, 12) : [],
        moleculeIds,
        source: 'ai',
        created_at: Date.now(),
      };

      insertReaction(rowFromReaction(reaction, 'ai'));
      const saved = queryOne('SELECT * FROM chem_reactions WHERE id = ?', [id]);
      success(res, saved ? mapRow(saved) : null, '已保存反应');
    } catch (err) {
      console.error(err);
      error(res, '保存反应失败');
    }
  });

  /**
   * DELETE /api/reactions/:id
   * 仅允许删除 AI 添加的反应
   */
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const row = queryOne('SELECT * FROM chem_reactions WHERE id = ?', [
        req.params.id,
      ]);
      if (!row) {
        notFound(res, '反应不存在');
        return;
      }
      if (row.source === 'builtin') {
        badRequest(res, '内置反应不可删除');
        return;
      }
      run('DELETE FROM chem_reactions WHERE id = ?', [req.params.id]);
      success(res, null, '已删除');
    } catch (err) {
      console.error(err);
      error(res, '删除失败');
    }
  });

  return router;
}
