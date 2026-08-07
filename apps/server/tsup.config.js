/**
 * Server 构建骨架（Program 5 Task 5.1）。
 * 现状：pkg 过渡窗口内 src/index.js 是权威入口（Electron/pkg 直接引用），
 * TS 迁移完成前保持 JS 源码；本配置为 tsup CJS 产物预留
 * （目标 ES2022/Node 18 可执行子集，spec §6.4）。
 * 启用条件：pkg 退役（Program 6 Task 6.5）后接入并迁 src → TS。
 */
module.exports = {};
