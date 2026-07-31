/**
 * 数学学科 AI 路由
 */

const express = require('express');
const router = express.Router();
const { success, error, badRequest } = require('../../utils/response');
const { generateMathFunction } = require('../../services/ai/math-fn-service');

function mapAiError(res, err, fallbackMessage) {
  const status = err.status || 500;
  if (status === 400) return badRequest(res, err.message);
  if (status === 429) return error(res, err.message, 429);
  return error(res, err.message || fallbackMessage, status >= 400 ? status : 502);
}

/**
 * POST /api/ai/math/function
 * body: { prompt: string }
 */
router.post('/math/function', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) return badRequest(res, '请描述要添加的函数');
    // 函数生成走数学学科的 AI Key / 额度
    const data = await generateMathFunction(prompt, 'math');
    success(res, data);
  } catch (err) {
    console.error('AI 生成函数失败:', err);
    mapAiError(res, err, '生成函数失败');
  }
});

module.exports = router;
