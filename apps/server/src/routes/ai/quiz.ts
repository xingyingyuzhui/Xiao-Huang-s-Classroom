/**
 * AI 智能出题 API（B2 第五批：route TS 权威源）。
 *
 * 服务注入模式：quiz-service 函数与限流状态模块（quiz-assist-limit，
 * 模块级 1h 计数——inline 会双实例导致限流失效）均由组合根注入。
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

interface LimitResult {
  allowed: boolean;
  message?: string;
  reservationId?: string | null;
  resetInMs?: number;
  resetLabel?: string;
  used?: number;
  limit?: number;
}

/** 组合根注入：quiz-service + 限流状态（services/ai/quiz-service 权威源）。 */
export interface QuizRouterDeps {
  generateQuiz: (args: Record<string, unknown>) => Promise<unknown>;
  generateHint: (args: Record<string, unknown>) => Promise<unknown>;
  generateExplain: (args: Record<string, unknown>) => Promise<unknown>;
  explainFallback: (body: Record<string, unknown>) => unknown;
  scoreQuiz: (subjectId: string) => Promise<unknown>;
  summarizeQuiz: (args: Record<string, unknown>) => Promise<unknown>;
  reserveCall: (kind: 'hint' | 'explain') => LimitResult;
  releaseCall: (reservationId: string | null | undefined) => void;
}

export function createQuizRouter(deps: QuizRouterDeps): Router {
  const {
    generateQuiz,
    generateHint,
    generateExplain,
    explainFallback,
    scoreQuiz,
    summarizeQuiz,
    reserveCall,
    releaseCall,
  } = deps;
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

  /** 限流拒绝响应（hint/explain 共用）。 */
  function limitRejected(res: Response, lim: LimitResult, kind: string): void {
    res.status(429).json({
      success: false,
      message: lim.message,
      data: {
        limited: true,
        kind,
        resetInMs: lim.resetInMs,
        resetLabel: lim.resetLabel,
        used: lim.used,
        limit: lim.limit,
      },
    });
  }

  router.post('/quiz/generate', async (req: Request, res: Response) => {
    try {
      const data = await generateQuiz({
        ...(req.body as Record<string, unknown> | undefined),
        subjectId: resolveAiSubjectId(req),
      });
      success(res, data);
    } catch (err) {
      console.error('智能出题失败:', err);
      mapAiError(res, err, '出题失败');
    }
  });

  /**
   * POST /api/ai/quiz/hint
   * 单题提示（气泡用）；1h 内最多 20 次成功调模型
   */
  router.post('/quiz/hint', async (req: Request, res: Response) => {
    let reservationId: string | null | undefined = null;
    try {
      const { stem, options, knowledge } = (req.body || {}) as {
        stem?: unknown;
        options?: unknown;
        knowledge?: unknown;
      };
      if (!stem) {
        badRequest(res, '缺少题干');
        return;
      }

      const lim = reserveCall('hint');
      if (!lim.allowed) {
        limitRejected(res, lim, 'hint');
        return;
      }
      reservationId = lim.reservationId;

      const data = await generateHint({
        stem,
        options,
        knowledge,
        subjectId: resolveAiSubjectId(req),
      });
      success(res, data);
    } catch (err) {
      releaseCall(reservationId);
      console.error('题目提示失败:', err);
      const status = (err as { status?: number } | null)?.status || 500;
      const message = err instanceof Error ? err.message : String(err);
      if (status === 400) {
        badRequest(res, message);
        return;
      }
      error(res, message || '提示失败', status >= 400 ? status : 502);
    }
  });

  /**
   * POST /api/ai/quiz/explain
   * 单题解答；1h 内最多 20 次成功调模型（与提示分开计数）
   */
  router.post('/quiz/explain', async (req: Request, res: Response) => {
    let reservationId: string | null | undefined = null;
    try {
      const { stem, options, answer, knowledge, explain } = (req.body || {}) as {
        stem?: unknown;
        options?: unknown;
        answer?: unknown;
        knowledge?: unknown;
        explain?: unknown;
      };
      if (!stem) {
        badRequest(res, '缺少题干');
        return;
      }

      const lim = reserveCall('explain');
      if (!lim.allowed) {
        limitRejected(res, lim, 'explain');
        return;
      }
      reservationId = lim.reservationId;

      const data = await generateExplain({
        stem,
        options,
        answer,
        knowledge,
        explain,
        subjectId: resolveAiSubjectId(req),
      });
      success(res, data);
    } catch (err) {
      releaseCall(reservationId);
      console.error('题目解答失败:', err);
      // 非限流错误：可回落本地解析（占位已释放，不计成功调用）
      const fallback = explainFallback((req.body || {}) as Record<string, unknown>);
      if (fallback) {
        success(res, fallback);
        return;
      }
      const status = (err as { status?: number } | null)?.status || 500;
      const message = err instanceof Error ? err.message : String(err);
      if (status === 400) {
        badRequest(res, message);
        return;
      }
      error(res, message || '解答失败', status >= 400 ? status : 502);
    }
  });

  /**
   * POST /api/ai/quiz/score
   * 0～10 AI 评分；练习/错题数据指纹未变时直接返回缓存，不重复调模型
   */
  router.post('/quiz/score', async (req: Request, res: Response) => {
    try {
      const data = await scoreQuiz(resolveAiSubjectId(req));
      success(res, data);
    } catch (err) {
      console.error('AI 评分失败:', err);
      const status = (err as { status?: number } | null)?.status || 500;
      const message = err instanceof Error ? err.message : String(err);
      if (status === 400) {
        badRequest(res, message);
        return;
      }
      error(res, message || '评分失败', status >= 400 ? status : 502);
    }
  });

  /**
   * POST /api/ai/quiz/summary
   * 交卷后 AI 分析报告（右侧展示）
   */
  router.post('/quiz/summary', async (req: Request, res: Response) => {
    try {
      const { difficulty, topics = [], results = [] } = (req.body || {}) as {
        difficulty?: unknown;
        topics?: unknown[];
        results?: unknown[];
      };
      if (!Array.isArray(results) || !results.length) {
        badRequest(res, '缺少答题结果');
        return;
      }

      const data = await summarizeQuiz({
        difficulty,
        topics,
        results,
        subjectId: resolveAiSubjectId(req),
      });
      success(res, data);
    } catch (err) {
      console.error('练习总结失败:', err);
      const status = (err as { status?: number } | null)?.status || 500;
      const message = err instanceof Error ? err.message : String(err);
      if (status === 400) {
        badRequest(res, message);
        return;
      }
      error(res, message || '总结失败', status >= 400 ? status : 502);
    }
  });

  return router;
}
