/**
 * 离线题库 API（B2 第十五批：route TS 权威源）。
 *
 * db 注入模式：db 查询 + ensureQuizSchema + OFFLINE_QUESTIONS（seed
 * 数据）由组合根注入。offlinePapers 试卷缓存为工厂内状态（组合根
 * 单次调用 → 单实例）。
 */
/* eslint-disable @typescript-eslint/no-require-imports -- utils JS 引用经 tsup bundle */
import { Router, type Request, type Response } from 'express';

const { success, error, badRequest } = require('../../utils/response') as {
  success: (res: Response, data?: unknown, message?: string) => Response;
  error: (res: Response, message?: string, status?: number) => Response;
  badRequest: (res: Response, message?: string) => Response;
};

interface OfflineQuestion {
  sourceQuestionId: string;
  stem: string;
  options: string[];
  answer?: number;
  sourceExam?: string;
  sourceYear?: number | null;
}

/** 生成后的试卷题（question 为渲染用题干）。 */
interface PaperQuestion {
  sourceQuestionId: string;
  question: string;
  options: string[];
  answer: number;
  sourceExam?: string;
  sourceYear?: number | null;
}

/** 组合根注入：db 查询 + schema 初始化 + 题库数据（seed 权威源）。 */
export interface OfflineQuizRouterDeps {
  query: (sql: string, params?: unknown[]) => Array<Record<string, unknown>>;
  queryOne: (sql: string, params?: unknown[]) => Record<string, unknown> | null;
  run: (sql: string, params?: unknown[]) => unknown;
  runBatch: (fn: () => void) => unknown;
  ensureQuizSchema: () => unknown;
  OFFLINE_QUESTIONS: OfflineQuestion[];
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createOfflineQuizRouter(deps: OfflineQuizRouterDeps): Router {
  const { query, queryOne, run, runBatch, ensureQuizSchema, OFFLINE_QUESTIONS } = deps;
  const router = Router();

  /** 2 小时内生成的离线试卷（提交后删除；过期清理）。 */
  const offlinePapers = new Map<string, { created: number; questions: PaperQuestion[] }>();

  function stripAnswer(q: OfflineQuestion) {
    return {
      sourceQuestionId: q.sourceQuestionId,
      question: q.stem,
      options: q.options,
      sourceExam: q.sourceExam,
      sourceYear: q.sourceYear,
    };
  }

  router.get('/years', (_req: Request, res: Response) => {
    try {
      const years = [...new Set(OFFLINE_QUESTIONS.map((q) => q.sourceYear))]
        .filter(Boolean)
        .sort((a, b) => Number(a) - Number(b));
      success(res, { years });
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  router.get('/list', (req: Request, res: Response) => {
    try {
      let questions = OFFLINE_QUESTIONS;
      const year = req.query.year ? Number(req.query.year) : null;
      if (year) questions = questions.filter((q) => q.sourceYear === year);
      const years = [...new Set(OFFLINE_QUESTIONS.map((q) => q.sourceYear))]
        .filter(Boolean)
        .sort((a, b) => Number(a) - Number(b));

      const total = questions.length;
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const start = (page - 1) * pageSize;
      const paged = questions.slice(start, start + pageSize);
      const safe = paged.map(stripAnswer);

      success(res, { questions: safe, total, page, pageSize, totalPages, years });
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  router.post('/generate', (req: Request, res: Response) => {
    try {
      const count = Math.min(OFFLINE_QUESTIONS.length, Math.max(1, Number((req.body as { count?: unknown } | null)?.count) || 5));
      const year = (req.body as { year?: unknown } | null)?.year ? Number((req.body as { year?: unknown }).year) : null;
      let pool = OFFLINE_QUESTIONS;
      if (year) pool = pool.filter((q) => q.sourceYear === year);
      if (!pool.length) {
        badRequest(res, '没有匹配的题目');
        return;
      }

      const shuffled = [...pool];
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const picked = shuffled.slice(0, Math.min(count, shuffled.length));
      const paperId = uid('op');

      offlinePapers.set(paperId, {
        created: Date.now(),
        questions: picked.map((q) => ({
          sourceQuestionId: q.sourceQuestionId,
          question: q.stem,
          options: q.options,
          answer: q.answer ?? -1,
          sourceExam: q.sourceExam,
          sourceYear: q.sourceYear,
        })),
      });

      const cutoff = Date.now() - 2 * 3600 * 1000;
      for (const [k, v] of offlinePapers) {
        if (v.created < cutoff) offlinePapers.delete(k);
      }

      const questions = picked.map(stripAnswer);
      success(res, { paperId, questions, total: questions.length });
    } catch (err) {
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  router.post('/submit', (req: Request, res: Response) => {
    try {
      ensureQuizSchema();
      const { paperId, answers } = (req.body || {}) as {
        paperId?: unknown;
        answers?: Array<{ id?: unknown; chosen?: unknown }>;
      };
      if (!paperId || !Array.isArray(answers) || !answers.length) {
        badRequest(res, '缺少 paperId 或 answers');
        return;
      }
      const paper = offlinePapers.get(String(paperId));
      if (!paper) {
        badRequest(res, '试卷不存在或已过期，请重新生成');
        return;
      }

      const sessionId = uid('qs');
      const now = Date.now();
      let correct = 0;
      let answered = 0;

      const chosenOf = (q: { sourceQuestionId: string }): number | null => {
        const a = answers.find((x) => x.id === q.sourceQuestionId) || {};
        return a.chosen === null || a.chosen === undefined || a.chosen === -1
          ? null
          : Number(a.chosen);
      };

      runBatch(() => {
        run(
          `INSERT INTO quiz_sessions (id, created_at, grades, difficulty, topics, reveal, total, correct, answered, summary, source_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [sessionId, now, '[]', '离线题库', '[]', 'immediate', paper.questions.length, 0, 0, '', 'offline'],
        );

        for (let idx = 0; idx < paper.questions.length; idx += 1) {
          const q = paper.questions[idx];
          const chosen = chosenOf(q);
          const isCorrect = chosen !== null && chosen === q.answer ? 1 : 0;
          if (chosen !== null) answered += 1;
          if (isCorrect) correct += 1;

          run(
            `INSERT INTO quiz_items (id, session_id, idx, stem, options, answer, knowledge, hint, explain_bank, chosen, used_hint, used_explain, is_correct)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [uid('qi'), sessionId, idx, q.question, JSON.stringify(q.options), q.answer, q.sourceExam || '', '', '', chosen, 0, 0, isCorrect],
          );
        }

        run(`UPDATE quiz_sessions SET correct = ?, answered = ? WHERE id = ?`, [
          correct,
          answered,
          sessionId,
        ]);

        for (let idx = 0; idx < paper.questions.length; idx += 1) {
          const q = paper.questions[idx];
          const chosen = chosenOf(q);
          const isCorrect = chosen !== null && chosen === q.answer;
          const stem = q.question;
          if (!isCorrect && chosen !== null) {
            const exists = queryOne(
              `SELECT id FROM quiz_wrong_book WHERE dismissed = 0 AND stem = ? LIMIT 1`,
              [stem],
            );
            if (exists) {
              run(
                `UPDATE quiz_wrong_book SET last_chosen = ?, last_session_id = ? WHERE id = ?`,
                [chosen, sessionId, exists.id],
              );
            } else {
              run(
                `INSERT INTO quiz_wrong_book
              (id, created_at, stem, options, answer, knowledge, hint, explain_bank, last_chosen, last_session_id, dismissed)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                [uid('wb'), now, stem, JSON.stringify(q.options), q.answer, q.sourceExam || '', '', '', chosen, sessionId],
              );
            }
          }
        }
      });

      const items = paper.questions.map((q) => {
        const chosen = chosenOf(q);
        return {
          sourceQuestionId: q.sourceQuestionId,
          question: q.question,
          options: q.options,
          answer: q.answer,
          chosen,
          correct: chosen !== null && chosen === q.answer,
          sourceExam: q.sourceExam,
        };
      });

      success(res, {
        sessionId,
        total: paper.questions.length,
        correct,
        answered,
        items,
      });

      offlinePapers.delete(String(paperId));
    } catch (err) {
      console.error('offline quiz submit', err);
      error(res, err instanceof Error ? err.message : String(err));
    }
  });

  return router;
}
