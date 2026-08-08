/**
 * B2 迁移桥：权威源为 src/routes/chemistry/quiz.ts（tsup CJS 产物）。
 * 本桥直接导出 createQuizRouter 工厂（组合根注入 sessions/wrong-book 服务）。
 */
module.exports = require('../../../dist/routes/chemistry/quiz.js').createQuizRouter;
