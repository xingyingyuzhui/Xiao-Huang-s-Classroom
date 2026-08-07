/** @xiaohuang/config 包版本（统一应用版本占位，Program 6 接入 stage manifest 版本）。 */
export const APP_VERSION = '0.0.1' as const;

/** Node 最低运行基线（Electron 33 内嵌 Node 20；pkg 退役后正式启用）。 */
export const MIN_NODE_MAJOR = 20 as const;
