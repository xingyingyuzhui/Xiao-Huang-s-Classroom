/**
 * GraphRenderer：doc diff 与各 layer 的增量投影。
 *
 * 职责：由 previous/current 文档计算 render plan（add/update/remove + 依赖闭包），
 * 在 store beforeCommit 阶段做原子 staging/journal 应用。
 */
