/**
 * AI 化学功能 API（B2 第六批：route TS 权威源）。
 *
 * 服务注入模式：ai-service 函数（依赖 db 的服务链）由组合根注入，
 * 产物不 inline 服务链（避免 sql.js 双实例）。utils 无状态 bundle。
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

/** 组合根注入：AI 化学服务（services/chemistry/ai-service 权威源）。 */
export interface ChemistryAiRouterDeps {
  generateTip: (args: { subjectId: string }) => Promise<unknown>;
  tipLocalFallback: (subjectId: string) => unknown;
  generateReaction: (args: Record<string, unknown>) => Promise<unknown>;
  generateStoich: (prompt: string, subjectId: string) => Promise<unknown>;
  generateLab: (prompt: string, subjectId: string) => Promise<unknown>;
  generateBalanceStepTip: (args: Record<string, unknown>) => Promise<unknown>;
  generateBalance: (equation: string, subjectId: string) => Promise<unknown>;
}

export function createChemistryAiRouter(deps: ChemistryAiRouterDeps): Router {
  const {
    generateTip,
    tipLocalFallback,
    generateReaction,
    generateStoich,
    generateLab,
    generateBalanceStepTip,
    generateBalance,
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
      error(res, message, 429);
      return;
    }
    error(res, message || fallbackMessage, status >= 400 ? status : 502);
  }

  router.post('/tip', async (req: Request, res: Response) => {
    try {
      const subjectId = resolveAiSubjectId(req);
      const data = await generateTip({ subjectId });
      success(res, data);
    } catch (err) {
      console.error('AI 小知识失败:', err);
      try {
        success(res, tipLocalFallback(resolveAiSubjectId(req)));
      } catch {
        error(res, err instanceof Error ? err.message : String(err) || 'AI 生成失败');
      }
    }
  });

  router.post('/reaction', async (req: Request, res: Response) => {
    try {
      const { prompt, moleculeId, moleculeName, moleculeFormula, stepCount } = (req.body ||
        {}) as Record<string, unknown>;
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        badRequest(res, '请描述要添加的化学反应');
        return;
      }

      const data = await generateReaction({
        prompt,
        moleculeId,
        moleculeName,
        moleculeFormula,
        stepCount,
        subjectId: resolveAiSubjectId(req),
      });
      success(res, data);
    } catch (err) {
      console.error('AI 生成反应失败:', err);
      mapAiError(res, err, '生成反应失败');
    }
  });

  router.post('/stoich', async (req: Request, res: Response) => {
    try {
      const prompt = String((req.body as { prompt?: unknown } | null)?.prompt || '').trim();
      if (!prompt) {
        badRequest(res, '请输入计量题目');
        return;
      }

      const data = await generateStoich(prompt, resolveAiSubjectId(req));
      success(res, data);
    } catch (err) {
      console.error('AI 计量失败:', err);
      mapAiError(res, err, '分步解答失败');
    }
  });

  router.post('/lab', async (req: Request, res: Response) => {
    try {
      const prompt = String((req.body as { prompt?: unknown } | null)?.prompt || '').trim();
      if (!prompt) {
        badRequest(res, '请描述要生成的实验');
        return;
      }

      const data = await generateLab(prompt, resolveAiSubjectId(req));
      success(res, data);
    } catch (err) {
      console.error('AI lab 生成失败:', err);
      mapAiError(res, err, '实验生成失败');
    }
  });

  router.post('/balance', async (req: Request, res: Response) => {
    try {
      const equation = String((req.body as { equation?: unknown } | null)?.equation || '').trim();
      if (!equation) {
        badRequest(res, '请输入方程式');
        return;
      }

      const mode = String((req.body as { mode?: unknown } | null)?.mode || '').trim();
      const subjectId = resolveAiSubjectId(req);

      if (mode === 'step_tip') {
        const step =
          (req.body as { step?: unknown } | null)?.step &&
          typeof (req.body as { step?: unknown } | null)?.step === 'object'
            ? (req.body as { step?: unknown } | null)?.step
            : {};
        const data = await generateBalanceStepTip({ equation, step, subjectId });
        success(res, data);
        return;
      }

      const data = await generateBalance(equation, subjectId);
      success(res, data);
    } catch (err) {
      console.error('AI 配平失败:', err);
      const status = (err as { status?: number } | null)?.status || 500;
      const message = err instanceof Error ? err.message : String(err);
      if (status === 400) {
        badRequest(res, message);
        return;
      }
      error(res, message || '配平建议失败', status >= 400 ? status : 502);
    }
  });

  return router;
}
