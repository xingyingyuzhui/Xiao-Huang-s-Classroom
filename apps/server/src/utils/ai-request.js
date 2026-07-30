/**
 * 从请求解析 AI 调用所属学科
 */

const { READY_SUBJECT_IDS } = require('@xiaohuang/subject-settings');

/**
 * @param {import('express').Request} req
 * @returns {string}
 */
function resolveAiSubjectId(req) {
  const fromBody =
    typeof req.body?.subjectId === 'string' ? req.body.subjectId.trim() : '';
  const fromHeader =
    typeof req.headers['x-subject-id'] === 'string' ? req.headers['x-subject-id'].trim() : '';
  const candidate = fromBody || fromHeader || 'chemistry';
  return READY_SUBJECT_IDS.includes(candidate) ? candidate : 'chemistry';
}

module.exports = { resolveAiSubjectId };
