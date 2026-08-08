/**
 * B2 迁移桥：权威源为 src/routes/ai/quiz.ts（tsup CJS 产物）。
 * 本桥直接导出 createQuizRouter 工厂（组合根注入 quiz-service 与限流状态）。
 */
module.exports = require('../../../dist/routes/ai/quiz.js').createQuizRouter;
