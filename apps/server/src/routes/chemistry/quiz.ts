/**
 * 智能出题：历史场次、错题本（SQLite）（B2 第七批：route TS 权威源）。
 *
 * 服务注入模式：sessions/wrong-book 服务（内部 require db/sqlite 单例）
 * 由组合根注入，产物不 inline 服务链（避免 sql.js 双实例）。
 * utils（response）无状态，经 tsup bundle 进产物。
 */
/* eslint-disable @typescript-eslint/no-require-imports -- utils JS 引用经 tsup bundle */
import { Router, type Request, type Response } from 'express';

const { success, error, badRequest, notFound } = require('../../utils/response') as {
  success: (res: Response, data?: unknown, message?: string) => Response;
  error: (res: Response, message?: string, status?: number) => Response;
  badRequest: (res: Response, message?: string) => Response;
  notFound: (res: Response, message?: string) => Response;
};

/** 组合根注入：quiz sessions / wrong-book 服务（services/chemistry/quiz 权威源）。 */
export interface QuizRouterDeps {
  getQuizStats: () => unknown;
  createQuizSession: (body: unknown) => unknown;
  updateSessionSummary: (id: string, summary: unknown) => unknown;
  listWrongBook: () => unknown;
  attemptWrongBook: (id: string, chosen: unknown) => unknown;
}

export function createQuizRouter(deps: QuizRouterDeps): Router {
  const { getQuizStats, createQuizSession, updateSessionSummary, listWrongBook, attemptWrongBook } =
    deps;
  const router = Router();

  function mapQuizError(res: Response, err: unknown, fallbackMessage: string): void {
    const status = (err as { status?: number } | null)?.status || 500;
    const message = err instanceof Error ? err.message : String(err);
    if (status === 400) {
      badRequest(res, message);
      return;
    }
    if (status === 404) {
      notFound(res, message);
      return;
    }
    error(res, message || fallbackMessage);
  }

  /**
   * GET /api/quiz/stats
   * 历史做题数据总结
   */
  router.get('/stats', (_req: Request, res: Response) => {
    try {
      success(res, getQuizStats());
    } catch (err) {
      console.error('quiz stats', err);
      mapQuizError(res, err, '统计失败');
    }
  });

  /**
   * POST /api/quiz/sessions
   * 保存一整场练习；错题本收录：答错 或 使用过 AI 解答
   */
  router.post('/sessions', (req: Request, res: Response) => {
    try {
      success(res, createQuizSession(req.body || {}));
    } catch (err) {
      console.error('save quiz session', err);
      mapQuizError(res, err, '保存失败');
    }
  });

  /**
   * GET /api/quiz/wrong-book
   */
  router.get('/wrong-book', (_req: Request, res: Response) => {
    try {
      success(res, listWrongBook());
    } catch (err) {
      console.error('wrong book list', err);
      mapQuizError(res, err, '读取错题本失败');
    }
  });

  /**
   * POST /api/quiz/wrong-book/:id/attempt
   * 错题本内重练：做对自动出本，做错保留并更新 last_chosen
   * body: { chosen: 0-3 }
   */
  router.post('/wrong-book/:id/attempt', (req: Request, res: Response) => {
    try {
      success(res, attemptWrongBook(String(req.params.id), (req.body as { chosen?: unknown } | null)?.chosen));
    } catch (err) {
      console.error('wrong book attempt', err);
      mapQuizError(res, err, '提交失败');
    }
  });

  /**
   * PATCH session summary text
   */
  router.patch('/sessions/:id/summary', (req: Request, res: Response) => {
    try {
      success(res, updateSessionSummary(String(req.params.id), (req.body as { summary?: unknown } | null)?.summary));
    } catch (err) {
      mapQuizError(res, err, '更新失败');
    }
  });

  return router;
}
