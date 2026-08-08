/**
 * B2 迁移桥：权威源为 src/routes/chemistry/reactions.ts（tsup CJS 产物）。
 * 本桥直接导出 createReactionsRouter 工厂（组合根注入 db 与 seed 写入）。
 */
module.exports = require('../../../dist/routes/chemistry/reactions.js').createReactionsRouter;
