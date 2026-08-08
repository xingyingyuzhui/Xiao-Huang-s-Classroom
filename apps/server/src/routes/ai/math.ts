/**
 * 数学学科 AI 路由（B2 第十六批：route TS 权威源）。
 *
 * 服务注入模式：generateMathFunction（依赖 db 的服务链）由组合根注入。
 * utils（response）无状态 bundle。
 */
/* eslint-disable @typescript-eslint/no-require-imports -- utils JS 引用经 tsup bundle */
import { Router, type Request, type Response } from 'express';

const { success, error, badRequest } = require('../../utils/response') as {
  success: (res: Response, data?: unknown, message?: string) => Response;
  error: (res: Response, message?: string, status?: number) => Response;
  badRequest: (res: Response, message?: string) => Response;
};

/** 组合根注入：数学函数生成服务（services/ai/math-fn-service 权威源）。 */
export interface MathAiRouterDeps {
  generateMathFunction: (prompt: string, subjectId: string) => Promise<unknown>;
}

export function createMathAiRouter(deps: MathAiRouterDeps): Router {
  const { generateMathFunction } = deps;
  const router = Router();

  function mapAiError(res: Response, err: unknown, fallbackMessage: string): void {
    const status = (err as { status?: number } | null)?.status || 500;
    const message = err instanceof Error ? err.message : String(err);
    if (status === 400) {
      badRequest(res, message);
      return;
    }
    if (status === 429) {
      error(res, message, 429);
      return;
    }
    error(res, message || fallbackMessage, status >= 400 ? status : 502);
  }

  /**
   * POST /api/ai/math/function
   * body: { prompt: string }
   */
  router.post('/math/function', async (req: Request, res: Response) => {
    try {
      const prompt = String((req.body as { prompt?: unknown } | null)?.prompt || '').trim();
      if (!prompt) {
        badRequest(res, '请描述要添加的函数');
        return;
      }
      // 函数生成走数学学科的 AI Key / 额度
      const data = await generateMathFunction(prompt, 'math');
      success(res, data);
    } catch (err) {
      console.error('AI 生成函数失败:', err);
      mapAiError(res, err, '生成函数失败');
    }
  });

  return router;
}
