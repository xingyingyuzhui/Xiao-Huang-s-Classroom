/**
 * C4 迁移桥：权威源为 src/main.ts（tsup CJS 产物 dist/main.js）。
 * 产物 bundle 含 startup-state-machine（app.asar 不再依赖 src/ 目录）。
 * electron-builder 入口保持 main.cjs（files 含 dist/main.js）；
 * B3 批次完成后随 electron-builder files 换产物入口删除本文件。
 */
module.exports = require('./dist/main.js');
