import { getCurrentSubjectId } from '../../subjects/session.js';

/** 为 AI 请求附加当前学科上下文 */
export function withAiSubject(payload = {}) {
  return {
    ...payload,
    subjectId: getCurrentSubjectId() || 'chemistry',
  };
}
