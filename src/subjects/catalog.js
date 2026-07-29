/**
 * 学科目录（v1：仅化学可进入）
 */

/** @typedef {{ id: string, name: string, desc: string, status: 'ready' | 'soon' }} SubjectMeta */

/** @type {SubjectMeta[]} */
export const SUBJECTS = [
  {
    id: 'chemistry',
    name: '化学',
    desc: '周期表 · 分子 · 课堂 · 对战',
    status: 'ready',
  },
  {
    id: 'physics',
    name: '物理',
    desc: '力学 · 电学 · 实验（规划中）',
    status: 'soon',
  },
  {
    id: 'biology',
    name: '生物',
    desc: '细胞 · 遗传 · 生态（规划中）',
    status: 'soon',
  },
  {
    id: 'math',
    name: '数学',
    desc: '代数 · 几何 · 练习（规划中）',
    status: 'soon',
  },
];

export function getSubject(id) {
  return SUBJECTS.find((s) => s.id === id) || null;
}
