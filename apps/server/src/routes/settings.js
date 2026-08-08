/**
 * B2 迁移桥：权威源为 src/routes/settings.ts（tsup CJS 产物）。
 * 本桥直接导出 createSettingsRouter 工厂（组合根注入 db 查询调用）。
 * 2 级路径：src/routes/ 与 dist/routes/ 均解析到 serverRoot/dist。
 */
module.exports = require('../../dist/routes/settings.js').createSettingsRouter;
