/**
 * C1 迁移桥（B1 样板）：权威源为 src/services/settings-service.ts（tsup CJS 产物）。
 * 构建链保证 dist 产物先于加载存在（pretest / turbo build / stage 预构建）。
 * 禁止双路径 try/catch；B2 route 迁移完成后随 src/index.js 换 dist 入口删除本文件。
 */
module.exports = require('../../dist/services/settings-service.js');
