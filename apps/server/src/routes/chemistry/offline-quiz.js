/**
 * B2 迁移桥：权威源为 src/routes/chemistry/offline-quiz.ts（tsup CJS 产物）。
 * 本桥直接导出 createOfflineQuizRouter 工厂（组合根注入 db/schema/题库）。
 */
module.exports = require('../../../dist/routes/chemistry/offline-quiz.js').createOfflineQuizRouter;
