/**
 * 教室工厂注册表（B4/B5）：环外装配层。
 *
 * registry.js（浏览器装配）加载时注册工厂；manifest 的 classroom.mount
 * 动态查询工厂。本模块零 import——保证 manifest ↔ registry 工厂链之间
 * 无依赖环（home-shell → manifest → registry → … → home-shell 已断）。
 */
/** @type {Map<string, (deps: { select: (sel: string) => Element | null }) => import('./classrooms/types.js').SubjectClassroom>} */
const factories = new Map();

/** @param {string} id */
export function registerClassroomFactory(id, factory) {
  factories.set(id, factory);
}

/** @param {string} id */
export function getClassroomFactory(id) {
  return factories.get(id) ?? null;
}

/** @param {string} id */
export function hasClassroomFactory(id) {
  return factories.has(id);
}
