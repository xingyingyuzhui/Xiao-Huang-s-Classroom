/**
 * 课堂概念讲解 API（B2 第三批：route TS 权威源）。
 *
 * 服务注入模式：explainConcept（依赖 db 的服务链）由组合根注入，
 * 产物不持有 DB 状态、不 inline 服务链（避免 sql.js 双实例）。
 * utils（response/ai-request）无状态，经 tsup bundle 进产物。
 */
/* eslint-disable @typescript-eslint/no-require-imports -- utils JS 引用经 tsup bundle */
import { Router, type Request, type Response } from 'express';

const { success, error, badRequest } = require('../../utils/response') as {
  success: (res: Response, data?: unknown, message?: string) => Response;
  error: (res: Response, message?: string, status?: number) => Response;
  badRequest: (res: Response, message?: string) => Response;
};
const { resolveAiSubjectId } = require('../../utils/ai-request') as {
  resolveAiSubjectId: (req: Request) => string;
};

/** 组合根注入：概念讲解服务（services/ai/lesson-service 权威源）。 */
export interface LessonRouterDeps {
  explainConcept: (args: {
    topic: string;
    focus?: unknown;
    labHint?: unknown;
    subjectId: string;
  }) => Promise<unknown>;
}

export function createLessonRouter(deps: LessonRouterDeps): Router {
  const { explainConcept } = deps;
  const router = Router();

  function mapAiError(res: Response, err: unknown, fallbackMessage: string): void {
    const status = (err as { status?: number } | null)?.status || 500;
    const message = err instanceof Error ? err.message : String(err);
    if (status === 400) {
      badRequest(res, message);
      return;
    }
    if (status === 429) {
      res.status(429).json({
        success: false,
        message,
        data: null,
      });
      return;
    }
    error(res, message || fallbackMessage, status >= 400 ? status : 502);
  }

  /**
   * POST /api/ai/lesson/explain
   * body: { topic, focus?, labHint? }
   */
  router.post('/lesson/explain', async (req: Request, res: Response) => {
    try {
      const { topic, focus, labHint } = (req.body || {}) as {
        topic?: unknown;
        focus?: unknown;
        labHint?: unknown;
      };
      if (!topic || !String(topic).trim()) {
        badRequest(res, '请选择或填写讲解主题');
        return;
      }
      const data = await explainConcept({
        topic: String(topic),
        focus,
        labHint,
        subjectId: resolveAiSubjectId(req),
      });
      success(res, data);
    } catch (err) {
      console.error('概念讲解失败:', err);
      mapAiError(res, err, '讲解生成失败');
    }
  });

  return router;
}
