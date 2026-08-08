/**
 * B2 迁移桥：权威源为 src/routes/ai/lesson.ts（tsup CJS 产物）。
 * 本桥直接导出 createLessonRouter 工厂（组合根注入 explainConcept）。
 */
module.exports = require('../../../dist/routes/ai/lesson.js').createLessonRouter;
