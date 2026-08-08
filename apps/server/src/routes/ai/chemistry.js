/**
 * B2 迁移桥：权威源为 src/routes/ai/chemistry.ts（tsup CJS 产物）。
 * 本桥直接导出 createChemistryAiRouter 工厂（组合根注入 ai-service）。
 */
module.exports = require('../../../dist/routes/ai/chemistry.js').createChemistryAiRouter;
