/**
 * AI 分子生成 API（B2 第四批：route TS 权威源）。
 *
 * 服务注入模式：callDeepSeekChat（依赖 db 的服务链）由组合根注入，
 * 产物不 inline 服务链（避免 sql.js 双实例）。utils（response/
 * ai-request/molecule-validate）无状态，经 tsup bundle 进产物。
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
const { validateMoleculePayload, rejectComplexPrompt } = require('../../utils/molecule-validate') as {
  validateMoleculePayload: (
    payload: unknown,
    opts: { fromAi: boolean; strictGeometry: boolean; relax: boolean; maxAtoms: number },
  ) => unknown;
  rejectComplexPrompt: (prompt: string) => string | null;
};

/** 组合根注入：DeepSeek 聊天服务（services/ai/chat-service 权威源）。 */
export interface MoleculeRouterDeps {
  callDeepSeekChat: (args: {
    system: string;
    user: string;
    temperature: number;
    max_tokens: number;
    kind: string;
    subjectId: string;
  }) => Promise<{ content: string }>;
}

const SYSTEM_PROMPT = `你是高中化学教学助手，负责生成可用于 3D 球棍模型展示的**小分子**结构数据。
用户会用中文描述分子名称、化学式或用途。你必须只输出一个 JSON 对象，不要 Markdown 代码块，不要其它说明文字。

JSON 字段：
{
  "name": "中文名",
  "formula": "化学式（可用 unicode 下标如 H₂O，也可用 H2O）",
  "desc": "一两句中文教学说明",
  "atoms": [ { "el": "元素符号", "x": 数字, "y": 数字, "z": 数字 } ],
  "bonds": [ [原子索引i, 原子索引j], ... ],
  "physics": {
    "state": "常温状态（固态/液态/气态）",
    "density": "密度（如 1 g/cm³）",
    "meltingPoint": "熔点（如 0°C）",
    "boilingPoint": "沸点（如 100°C）"
  },
  "chemistry": {
    "acidity": "酸碱性（如 酸性/碱性/中性）",
    "solubility": "溶解性（如 易溶/微溶/难溶）",
    "reactivity": "化学活性（如 稳定/活泼/强氧化性）"
  }
}

规则（必须遵守）：
1. el 必须是合法元素符号（H, C, O, N, Cl, S, P, Na, Fe 等），首字母大写。
2. 坐标为埃(Å)量级，分子居中，**相邻成键原子间距约 1.0～1.8**，不要把所有原子堆在原点。
3. bonds 索引从 0 开始，必须在 atoms 范围内；单键写一次 [i,j]，双键写两次，三键写三次。
4. **原子总数 2～18 个**（含氢）。葡萄糖等可含氢到上限内；更大的分子禁止输出。
5. **禁止**输出紫杉醇、阿莫西林、蛋白质、聚合物等复杂药物/生物大分子的完整结构。
6. 若用户要的是复杂分子：不要硬编坐标，应改输出一个**高中可教的相关小分子**（如青霉素→简化内酰胺示例可改为「乙酸」或「苯」并在 desc 说明「原请求过复杂，已改为…」）。
7. physics 和 chemistry 用简洁中文。
8. 只输出 JSON。`;

function fixJson(s: string): string {
  return s.replace(/,\s*([}\]])/g, '$1');
}

export function createMoleculeRouter(deps: MoleculeRouterDeps): Router {
  const { callDeepSeekChat } = deps;
  const router = Router();

  router.post('/generate', async (req: Request, res: Response) => {
    try {
      const { prompt } = (req.body || {}) as { prompt?: unknown };

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        badRequest(res, '请输入要生成的分子描述');
        return;
      }

      const complexReason = rejectComplexPrompt(prompt);
      if (complexReason) {
        badRequest(res, complexReason);
        return;
      }

      let content: string;
      try {
        const chat = await callDeepSeekChat({
          system: SYSTEM_PROMPT,
          user: `请为以下描述生成分子 JSON：\n${prompt.trim()}`,
          temperature: 0.3,
          max_tokens: 4096,
          kind: 'mol-generate',
          subjectId: resolveAiSubjectId(req),
        });
        content = chat.content;
      } catch (e) {
        const status = (e as { status?: number } | null)?.status || 502;
        const message = e instanceof Error ? e.message : String(e);
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
        error(res, message || 'DeepSeek 请求失败', status >= 400 ? status : 502);
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content.trim());
      } catch (e1) {
        let s = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        try {
          parsed = JSON.parse(s);
        } catch (e2) {
          const a = s.indexOf('{');
          const b = s.lastIndexOf('}');
          if (a >= 0 && b > a) {
            parsed = JSON.parse(fixJson(s.slice(a, b + 1)));
          } else {
            error(res, '模型返回不是合法 JSON', 502);
            return;
          }
        }
      }

      let validated: unknown;
      try {
        validated = validateMoleculePayload(parsed, {
          fromAi: true,
          strictGeometry: true,
          relax: true,
          maxAtoms: 24,
        });
      } catch (ve) {
        const message = ve instanceof Error ? ve.message : String(ve);
        badRequest(
          res,
          message || '生成的 3D 结构不可靠。请改用高中常见小分子（乙醇、苯、葡萄糖等）重试。',
        );
        return;
      }

      success(res, validated);
    } catch (err) {
      console.error('AI 生成分子失败:', err);
      const message = err instanceof Error ? err.message : String(err);
      error(res, message || 'AI 生成失败');
    }
  });

  return router;
}
