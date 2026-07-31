/**
 * 课堂概念讲解 API
 */

const express = require('express');
const router = express.Router();
const { success, error, badRequest } = require('../../utils/response');
const { resolveAiSubjectId } = require('../../utils/ai-request');
const { explainConcept } = require('../../services/ai/lesson-service');

function mapAiError(res, err, fallbackMessage) {
  const status = err.status || 500;
  if (status === 400) return badRequest(res, err.message);
  if (status === 429) {
    return res.status(429).json({
      success: false,
      message: err.message,
      data: null,
    });
  }
  return error(res, err.message || fallbackMessage, status >= 400 ? status : 502);
}

/**
 * POST /api/ai/lesson/explain
 * body: { topic, focus?, labHint? }
 */
router.post('/lesson/explain', async (req, res) => {
  try {
    const { topic, focus, labHint } = req.body || {};
    if (!topic || !String(topic).trim()) {
      return badRequest(res, '请选择或填写讲解主题');
    }
    const data = await explainConcept({
      topic,
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

module.exports = router;
