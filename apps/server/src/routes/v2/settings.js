/**
 * API v2：/api/v2/settings（Program 5 Task 5.4）。
 *
 * 规范响应 { success, data|error, requestId }（packages/contracts apiResponseSchema）；
 * 与 v1 复用同一 application service（settings-service），禁止复制业务逻辑。
 */
const express = require('express');
const { loadSubjectSettings } = require('../../services/settings-service');
const { queryOne } = require('../../db/sqlite');

const router = express.Router();

function requestId(req) {
  return String(req.headers['x-request-id'] || '');
}

router.get('/subject-settings', (req, res) => {
  const result = loadSubjectSettings({ queryOne: (sql, params) => queryOne(sql, params) });
  if (!result.ok) {
    res.status(500).json({
      success: false,
      error: { code: result.error.code, message: result.error.message, scope: 'settings' },
      requestId: requestId(req),
    });
    return;
  }
  res.json({ success: true, data: result.value, requestId: requestId(req) });
});

module.exports = router;
