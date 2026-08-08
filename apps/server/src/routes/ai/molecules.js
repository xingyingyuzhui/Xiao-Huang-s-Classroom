/**
 * B2 迁移桥：权威源为 src/routes/ai/molecules.ts（tsup CJS 产物）。
 * 本桥直接导出 createMoleculeRouter 工厂（组合根注入 callDeepSeekChat）。
 */
module.exports = require('../../../dist/routes/ai/molecules.js').createMoleculeRouter;
