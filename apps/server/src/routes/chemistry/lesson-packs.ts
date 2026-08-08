/**
 * 备课包 CRUD + 导入导出 API（B2 第十二批：route TS 权威源）。
 *
 * db 注入模式：db 查询与 import-labs 函数（内部 require db）均由组合根
 * 注入。utils（response）无状态 bundle。
 */
/* eslint-disable @typescript-eslint/no-require-imports -- utils JS 引用经 tsup bundle */
import { Router, type Request, type Response } from 'express';

const { success, error, badRequest, notFound } = require('../../utils/response') as {
  success: (res: Response, data?: unknown, message?: string) => Response;
  error: (res: Response, message?: string, status?: number) => Response;
  badRequest: (res: Response, message?: string) => Response;
  notFound: (res: Response, message?: string) => Response;
};

const PACK_FORMAT = 'xiaohuang-lesson-pack';
const PACK_VERSION = 1;
const LAB_PACK_FORMAT = 'xiaohuang-lab-pack';
const LAB_PACK_VERSION = 1;

/** 组合根注入：db 查询 + import-labs 函数（import-labs 权威源）。 */
export interface LessonPacksRouterDeps {
  query: (sql: string, params?: unknown[]) => Array<Record<string, unknown>>;
  queryOne: (sql: string, params?: unknown[]) => Record<string, unknown> | null;
  run: (sql: string, params?: unknown[]) => unknown;
  getLab: (id: string) => Record<string, unknown> | null;
  listLabs: () => Array<Record<string, unknown>>;
  ensureLabsSeeded: () => unknown;
  importLabsSafe: (labs: unknown[]) => {
    created?: number;
    renamed?: number;
    skipped?: number;
    errors?: string[];
  };
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createLessonPacksRouter(deps: LessonPacksRouterDeps): Router {
  const { query, queryOne, run, getLab, listLabs, ensureLabsSeeded, importLabsSafe } = deps;
  const router = Router();

  function ensureTable(): void {
    try {
      run(`CREATE TABLE IF NOT EXISTS lesson_packs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      grade TEXT DEFAULT '',
      topics TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      contents_json TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
    } catch (e) {
      console.warn('ensureTable lesson_packs', e instanceof Error ? e.message : String(e));
    }
  }

  function sanitizePack(row: Record<string, unknown> | null) {
    if (!row) return null;
    let contents: Record<string, unknown> = {};
    try {
      contents = JSON.parse(String(row.contents_json || '{}'));
    } catch {
      /* keep {} */
    }
    return {
      id: row.id,
      name: row.name,
      grade: row.grade || '',
      topics: row.topics || '',
      notes: row.notes || '',
      contents,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** 清洗导出数据：排除敏感字段；附带 selectedLabs 的完整实验子集 */
  function sanitizeForExport(row: Record<string, unknown>) {
    const pack = sanitizePack(row);
    if (!pack) return null;
    ensureLabsSeeded();
    const contents = { ...(pack.contents || {}) };
    const selected = Array.isArray(contents.selectedLabs) ? contents.selectedLabs : [];
    const labs = (selected as unknown[])
      .map((id) => getLab(String(id)))
      .filter((l): l is Record<string, unknown> => l !== null)
      .map((l) => ({
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
    // 若未勾选具体实验但希望导出当前库中全部，可在 contents.includeAllLabs 时附带
    if (contents.includeAllLabs) {
      contents.labs = listLabs().map((l) => ({
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
    } else if (labs.length) {
      contents.labs = labs;
    }
    return {
      format: PACK_FORMAT,
      version: PACK_VERSION,
      metadata: {
        name: pack.name,
        grade: pack.grade,
        topics: pack.topics,
        notes: pack.notes,
        exportedAt: new Date().toISOString(),
      },
      contents,
    };
  }

  /** 备课包内 labs：与实验库导入同一策略——永不覆盖，冲突新 id +「（导入）」 */
  function mergeLabsFromContents(labsIn: unknown) {
    if (!Array.isArray(labsIn) || !labsIn.length) {
      return { created: 0, renamed: 0, skipped: 0, updated: 0, errors: [] as string[] };
    }
    const result = importLabsSafe(labsIn);
    return {
      created: result.created,
      renamed: result.renamed,
      skipped: result.skipped,
      updated: 0,
      errors: result.errors || [],
    };
  }

  /** 校验导入数据结构 */
  function validateImport(data: unknown): { valid: boolean; reason?: string } {
    if (!data || typeof data !== 'object') {
      return { valid: false, reason: '无效的 JSON 文件' };
    }
    const d = data as { format?: unknown; version?: unknown; metadata?: unknown; contents?: unknown };
    if (d.format !== PACK_FORMAT) {
      return { valid: false, reason: `不支持的格式：${String(d.format || '(空)')}，需要 ${PACK_FORMAT}` };
    }
    if (d.version !== PACK_VERSION) {
      return { valid: false, reason: `不支持的版本：${String(d.version)}，当前仅支持 ${PACK_VERSION}` };
    }
    if (!d.metadata || typeof d.metadata !== 'object') {
      return { valid: false, reason: '缺少 metadata 字段' };
    }
    const meta = d.metadata as { name?: unknown };
    if (!meta.name || typeof meta.name !== 'string') {
      return { valid: false, reason: 'metadata.name 必须是非空字符串' };
    }
    if (d.contents && typeof d.contents !== 'object') {
      return { valid: false, reason: 'contents 必须是对象' };
    }
    return { valid: true };
  }

  /** 生成不重名的名称 */
  function uniqueName(baseName: string): string {
    const existing = (query('SELECT name FROM lesson_packs') as Array<{ name: unknown }>).map(
      (r) => String(r.name),
    );
    if (!existing.includes(baseName)) return baseName;
    let n = 2;
    while (existing.includes(`${baseName}（${n}）`)) n += 1;
    return `${baseName}（${n}）`;
  }

  // 列出所有备课包
  router.get('/', (_req: Request, res: Response) => {
    try {
      ensureTable();
      const rows = query('SELECT * FROM lesson_packs ORDER BY updated_at DESC');
      success(res, { packs: rows.map(sanitizePack) });
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  // 获取单个备课包
  router.get('/:id', (req: Request, res: Response) => {
    try {
      ensureTable();
      const row = queryOne('SELECT * FROM lesson_packs WHERE id = ?', [req.params.id]);
      if (!row) {
        notFound(res, '备课包不存在');
        return;
      }
      success(res, sanitizePack(row));
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  // 新建备课包
  router.post('/', (req: Request, res: Response) => {
    try {
      ensureTable();
      const { name, grade, topics, notes, contents } = (req.body || {}) as Record<string, unknown>;
      if (!name || typeof name !== 'string' || !name.trim()) {
        badRequest(res, '名称不能为空');
        return;
      }
      const id = uid('lp');
      const now = Date.now();
      run(
        `INSERT INTO lesson_packs (id, name, grade, topics, notes, contents_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name.trim(), String(grade || ''), String(topics || ''), String(notes || ''), JSON.stringify(contents || {}), now, now],
      );
      const row = queryOne('SELECT * FROM lesson_packs WHERE id = ?', [id]);
      success(res, sanitizePack(row));
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  // 更新备课包
  router.put('/:id', (req: Request, res: Response) => {
    try {
      ensureTable();
      const existing = queryOne('SELECT * FROM lesson_packs WHERE id = ?', [req.params.id]);
      if (!existing) {
        notFound(res, '备课包不存在');
        return;
      }
      const { name, grade, topics, notes, contents } = (req.body || {}) as Record<string, unknown>;
      const now = Date.now();
      run(
        `UPDATE lesson_packs SET name = ?, grade = ?, topics = ?, notes = ?, contents_json = ?, updated_at = ?
       WHERE id = ?`,
        [
          (name && String(name).trim()) || existing.name,
          grade !== undefined ? grade : existing.grade,
          topics !== undefined ? topics : existing.topics,
          notes !== undefined ? notes : existing.notes,
          contents !== undefined ? JSON.stringify(contents) : existing.contents_json,
          now,
          req.params.id,
        ],
      );
      const row = queryOne('SELECT * FROM lesson_packs WHERE id = ?', [req.params.id]);
      success(res, sanitizePack(row));
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  // 删除备课包
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      ensureTable();
      const existing = queryOne('SELECT id FROM lesson_packs WHERE id = ?', [req.params.id]);
      if (!existing) {
        notFound(res, '备课包不存在');
        return;
      }
      run('DELETE FROM lesson_packs WHERE id = ?', [req.params.id]);
      success(res, { deleted: true });
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  // 导出备课包（返回可下载的 JSON 结构）
  router.get('/:id/export', (req: Request, res: Response) => {
    try {
      ensureTable();
      const row = queryOne('SELECT * FROM lesson_packs WHERE id = ?', [req.params.id]);
      if (!row) {
        notFound(res, '备课包不存在');
        return;
      }
      success(res, sanitizeForExport(row ));
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  // 导入备课包（若 contents.labs 存在则合并进实验库）
  router.post('/import', (req: Request, res: Response) => {
    try {
      ensureTable();
      const data = (req.body || {}) as {
        format?: unknown;
        version?: unknown;
        labs?: unknown;
        metadata?: { name?: unknown; grade?: unknown; topics?: unknown; notes?: unknown };
        contents?: Record<string, unknown>;
      };

      // 分支：纯实验包也可从备课包入口导入
      if (data?.format === LAB_PACK_FORMAT) {
        if (data.version !== LAB_PACK_VERSION) {
          badRequest(res, `不支持的实验包版本：${String(data.version)}`);
          return;
        }
        const labsResult = mergeLabsFromContents(data.labs);
        success(res, {
          kind: 'lab-pack',
          labsResult,
          nameChanged: false,
        });
        return;
      }

      const validation = validateImport(data);
      if (!validation.valid) {
        badRequest(res, validation.reason);
        return;
      }
      const name = uniqueName(String(data.metadata?.name || '').trim());
      const id = uid('lp');
      const now = Date.now();
      const contents = data.contents || {};
      run(
        `INSERT INTO lesson_packs (id, name, grade, topics, notes, contents_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          name,
          String(data.metadata?.grade || ''),
          String(data.metadata?.topics || ''),
          String(data.metadata?.notes || ''),
          JSON.stringify(contents),
          now,
          now,
        ],
      );
      const labsResult = mergeLabsFromContents(contents.labs);
      const row = queryOne('SELECT * FROM lesson_packs WHERE id = ?', [id]);
      success(res, {
        kind: 'lesson-pack',
        pack: sanitizePack(row ),
        nameChanged: name !== data.metadata?.name,
        labsResult,
      });
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  return router;
}
