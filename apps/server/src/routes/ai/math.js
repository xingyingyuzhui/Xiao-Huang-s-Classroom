/**
 * B2 迁移桥：权威源为 src/routes/ai/math.ts（tsup CJS 产物）。
 * 本桥直接导出 createMathAiRouter 工厂（组合根注入服务）。
 */
module.exports = require('../../../dist/routes/ai/math.js').createMathAiRouter;
