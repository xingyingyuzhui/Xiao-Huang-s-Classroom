/**
 * 分子库 CRUD API（B2 第八批：route TS 权威源）。
 *
 * db 注入模式：query/queryOne/run/runBatch 由组合根注入
 * （src/db/sqlite 进程单例），产物不持有 DB 状态、不 inline sqlite。
 * utils（molecule-validate/response）无状态，经 tsup bundle。
 */
/* eslint-disable @typescript-eslint/no-require-imports -- utils JS 引用经 tsup bundle */
import { Router, type Request, type Response } from 'express';

const { success, error, notFound, badRequest } = require('../../utils/response') as {
  success: (res: Response, data?: unknown, message?: string) => Response;
  error: (res: Response, message?: string, status?: number) => Response;
  notFound: (res: Response, message?: string) => Response;
  badRequest: (res: Response, message?: string) => Response;
};
const { validateMoleculePayload, mapMoleculeRow } = require('../../utils/molecule-validate') as {
  validateMoleculePayload: (payload: unknown, opts?: Record<string, unknown>) => {
    id: string;
    name: string;
    formula: string;
    desc: string;
    atoms: unknown[];
    bonds: unknown[];
    physics: unknown;
    chemistry: unknown;
  };
  mapMoleculeRow: (row: Record<string, unknown>) => unknown;
};

/** 组合根注入的 db 查询接口（src/db/sqlite 进程单例）。 */
export interface MoleculesRouterDeps {
  query: (sql: string, params?: unknown[]) => Array<Record<string, unknown>>;
  queryOne: (sql: string, params?: unknown[]) => Record<string, unknown> | null;
  run: (sql: string, params?: unknown[]) => unknown;
  runBatch: (fn: () => void) => unknown;
}

export function createMoleculesRouter(deps: MoleculesRouterDeps): Router {
  const { query, queryOne, run, runBatch } = deps;
  const router = Router();

  /**
   * GET /api/molecules
   */
  router.get('/', (_req: Request, res: Response) => {
    try {
      const molecules = query(`
      SELECT m.*, COALESCE(o.sort_order, 999999) as sort_order
      FROM molecules m
      LEFT JOIN molecule_order o ON m.id = o.molecule_id
      ORDER BY sort_order, m.created_at
    `);

      const result = molecules
        .map((mol) => {
          try {
            return mapMoleculeRow(mol);
          } catch (e) {
            console.warn('跳过损坏分子行:', mol?.id, e instanceof Error ? e.message : String(e));
            return null;
          }
        })
        .filter(Boolean);

      success(res, result);
    } catch (err) {
      console.error('获取分子列表失败:', err);
      error(res, '获取分子列表失败');
    }
  });

  /**
   * GET /api/molecules/:id
   */
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const molecule = queryOne('SELECT * FROM molecules WHERE id = ?', [id]);
      if (!molecule) {
        notFound(res, '分子不存在');
        return;
      }
      success(res, mapMoleculeRow(molecule));
    } catch (err) {
      console.error('获取分子失败:', err);
      error(res, '获取分子失败');
    }
  });

  /**
   * POST /api/molecules
   */
  router.post('/', (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      if (!body.id) {
        badRequest(res, '缺少分子 id');
        return;
      }
      const id = String(body.id).slice(0, 80);

      const existing = queryOne('SELECT id FROM molecules WHERE id = ?', [id]);
      if (existing) {
        badRequest(res, '分子 ID 已存在');
        return;
      }

      let validated: {
        id: string;
        name: string;
        formula: string;
        desc: string;
        atoms: unknown[];
        bonds: unknown[];
        physics: unknown;
        chemistry: unknown;
      };
      try {
        validated = validateMoleculePayload(body);
      } catch (e) {
        badRequest(res, e instanceof Error ? e.message : '分子数据无效');
        return;
      }

      runBatch(() => {
        run(
          `INSERT INTO molecules (id, name, formula, desc, atoms, bonds, custom, physics, chemistry)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [
            id,
            validated.name,
            validated.formula,
            validated.desc,
            JSON.stringify(validated.atoms),
            JSON.stringify(validated.bonds),
            JSON.stringify(validated.physics),
            JSON.stringify(validated.chemistry),
          ],
        );

        const maxOrder = queryOne('SELECT MAX(sort_order) as max FROM molecule_order');
        const newOrder = ((maxOrder?.max as number | undefined) || 0) + 1;
        run('INSERT INTO molecule_order (molecule_id, sort_order) VALUES (?, ?)', [
          id,
          newOrder,
        ]);
      });

      success(res, { id }, '分子已添加');
    } catch (err) {
      console.error('添加分子失败:', err);
      error(res, '添加分子失败');
    }
  });

  /**
   * DELETE /api/molecules/:id
   */
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const molecule = queryOne('SELECT id, custom FROM molecules WHERE id = ?', [
        id,
      ]);
      if (!molecule) {
        notFound(res, '分子不存在');
        return;
      }
      if (!molecule.custom) {
        badRequest(res, '内置分子不能删除');
        return;
      }

      runBatch(() => {
        run('DELETE FROM molecules WHERE id = ?', [id]);
        run('DELETE FROM molecule_order WHERE molecule_id = ?', [id]);
      });

      success(res, null, '分子已删除');
    } catch (err) {
      console.error('删除分子失败:', err);
      error(res, '删除分子失败');
    }
  });

  /**
   * PUT /api/molecules/order
   */
  router.put('/order', (req: Request, res: Response) => {
    try {
      const { order } = (req.body || {}) as { order?: unknown };
      if (!Array.isArray(order)) {
        badRequest(res, '排序参数必须是数组');
        return;
      }
      if (!order.length) {
        badRequest(res, '排序不能为空');
        return;
      }

      const existing = new Set(
        (query('SELECT id FROM molecules') as Array<{ id: unknown }>).map((r) => String(r.id)),
      );
      const clean: string[] = [];
      const seen = new Set<string>();
      for (const raw of order) {
        const id = String(raw || '');
        if (!id || seen.has(id) || !existing.has(id)) continue;
        seen.add(id);
        clean.push(id);
      }
      if (!clean.length) {
        badRequest(res, '排序中无有效分子 id');
        return;
      }
      // 未出现在 order 里的分子补到末尾
      for (const id of existing) {
        if (!seen.has(id)) clean.push(id);
      }

      runBatch(() => {
        run('DELETE FROM molecule_order');
        clean.forEach((id, index) => {
          run('INSERT INTO molecule_order (molecule_id, sort_order) VALUES (?, ?)', [
            id,
            index + 1,
          ]);
        });
      });

      success(res, null, '排序已更新');
    } catch (err) {
      console.error('更新排序失败:', err);
      error(res, '更新排序失败');
    }
  });

  return router;
}
