/**
 * B2 迁移桥：权威源为 src/routes/chemistry/mastery.ts（tsup CJS 产物）。
 * 本桥直接导出 createMasteryRouter 工厂（组合根注入 db 与 schema 初始化）。
 */
module.exports = require('../../../dist/routes/chemistry/mastery.js').createMasteryRouter;
