/**
 * 班级名单 CRUD API（B2 第九批：route TS 权威源）。
 *
 * db 注入模式：query/queryOne/run/runBatch 由组合根注入
 * （src/db/sqlite 进程单例）。utils（response）无状态 bundle。
 */
/* eslint-disable @typescript-eslint/no-require-imports -- utils JS 引用经 tsup bundle */
import { Router, type Request, type Response } from 'express';

const { success, error, badRequest, notFound } = require('../../utils/response') as {
  success: (res: Response, data?: unknown, message?: string) => Response;
  error: (res: Response, message?: string, status?: number) => Response;
  badRequest: (res: Response, message?: string) => Response;
  notFound: (res: Response, message?: string) => Response;
};

/** 组合根注入的 db 查询接口（src/db/sqlite 进程单例）。 */
export interface StudentsRouterDeps {
  query: (sql: string, params?: unknown[]) => Array<Record<string, unknown>>;
  queryOne: (sql: string, params?: unknown[]) => Record<string, unknown> | null;
  run: (sql: string, params?: unknown[]) => unknown;
  runBatch: (fn: () => void) => unknown;
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export function createStudentsRouter(deps: StudentsRouterDeps): Router {
  const { query, queryOne, run, runBatch } = deps;
  const router = Router();

  /** GET /api/students */
  router.get('/', (_req: Request, res: Response) => {
    try {
      const rows = query(
        'SELECT * FROM class_students ORDER BY sort_order ASC, created_at ASC',
      );
      success(res, rows.map(mapRow));
    } catch (err) {
      console.error(err);
      error(res, '获取名单失败');
    }
  });

  /** POST /api/students  { name } */
  router.post('/', (req: Request, res: Response) => {
    try {
      const name = String((req.body as { name?: unknown } | null)?.name || '').trim().slice(0, 40);
      if (!name) {
        badRequest(res, '姓名不能为空');
        return;
      }
      const max = queryOne('SELECT MAX(sort_order) as m FROM class_students');
      const sortOrder = (max?.m != null ? Number(max.m) : -1) + 1;
      const id = `stu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const createdAt = Date.now();
      run(
        'INSERT INTO class_students (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)',
        [id, name, sortOrder, createdAt],
      );
      const inserted = queryOne('SELECT * FROM class_students WHERE id = ?', [id]);
      success(res, inserted ? mapRow(inserted) : null, '已添加');
    } catch (err) {
      console.error(err);
      error(res, '添加失败');
    }
  });

  /**
   * POST /api/students/import
   * { names: string[], mode: 'append'|'replace' }
   */
  router.post('/import', (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as { mode?: unknown; names?: unknown };
      const mode = body.mode === 'replace' ? 'replace' : 'append';
      let names = Array.isArray(body.names) ? body.names : [];
      names = names
        .map((n) => String(n || '').trim().slice(0, 40))
        .filter(Boolean);
      // 去重保序
      const seen = new Set<string>();
      names = names.filter((n) => {
        if (seen.has(n)) return false;
        seen.add(n);
        return true;
      });
      if (!names.length) {
        badRequest(res, '没有有效姓名');
        return;
      }

      const created: Array<{ id: string; name: string; sortOrder: number; createdAt: number }> = [];
      const now = Date.now();
      runBatch(() => {
        if (mode === 'replace') {
          run('DELETE FROM class_students');
        }
        const max = queryOne('SELECT MAX(sort_order) as m FROM class_students');
        let sortOrder = max?.m != null ? Number(max.m) + 1 : 0;
        for (const name of names.slice(0, 200)) {
          const id = `stu-${now.toString(36)}-${sortOrder}-${Math.random().toString(36).slice(2, 5)}`;
          run(
            'INSERT INTO class_students (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)',
            [id, name, sortOrder, now],
          );
          created.push({ id, name, sortOrder, createdAt: now });
          sortOrder += 1;
        }
      });
      success(res, { count: created.length, students: created }, `已导入 ${created.length} 人`);
    } catch (err) {
      console.error(err);
      error(res, '导入失败');
    }
  });

  /** PUT /api/students/:id  { name } */
  router.put('/:id', (req: Request, res: Response) => {
    try {
      const row = queryOne('SELECT * FROM class_students WHERE id = ?', [req.params.id]);
      if (!row) {
        notFound(res, '同学不存在');
        return;
      }
      const name = String((req.body as { name?: unknown } | null)?.name || '').trim().slice(0, 40);
      if (!name) {
        badRequest(res, '姓名不能为空');
        return;
      }
      run('UPDATE class_students SET name = ? WHERE id = ?', [name, req.params.id]);
      const updated = queryOne('SELECT * FROM class_students WHERE id = ?', [req.params.id]);
      success(res, updated ? mapRow(updated) : null);
    } catch (err) {
      console.error(err);
      error(res, '更新失败');
    }
  });

  /** DELETE /api/students/:id */
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const row = queryOne('SELECT * FROM class_students WHERE id = ?', [req.params.id]);
      if (!row) {
        notFound(res, '同学不存在');
        return;
      }
      run('DELETE FROM class_students WHERE id = ?', [req.params.id]);
      success(res, null, '已删除');
    } catch (err) {
      console.error(err);
      error(res, '删除失败');
    }
  });

  return router;
}
