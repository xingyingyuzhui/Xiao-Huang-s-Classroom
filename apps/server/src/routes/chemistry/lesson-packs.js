/**
 * B2 迁移桥：权威源为 src/routes/chemistry/lesson-packs.ts（tsup CJS 产物）。
 * 本桥直接导出 createLessonPacksRouter 工厂（组合根注入 db 与 import-labs）。
 */
module.exports = require('../../../dist/routes/chemistry/lesson-packs.js').createLessonPacksRouter;
