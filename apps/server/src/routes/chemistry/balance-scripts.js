/**
 * B2 迁移桥：权威源为 src/routes/chemistry/balance-scripts.ts（tsup CJS 产物）。
 * 本桥直接导出 createBalanceScriptsRouter 工厂（组合根注入 db 与 seed）。
 */
module.exports = require('../../../dist/routes/chemistry/balance-scripts.js').createBalanceScriptsRouter;
