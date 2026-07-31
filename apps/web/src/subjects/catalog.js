/**
 * 学科目录
 * - chemistry：完整实验室（多 Tab）
 * - math：多 Tab 实验室（函数画布 / 直线与圆 / 三角 / 数列 / 立体）
 * - physics / biology：教室首页壳（可进入，内容未填充）
 */

/**
 * @typedef {{
 *   edge: string,
 *   backBg: string,
 *   backInk: string,
 *   spineBg: string,
 *   spineInk: string,
 * }} SubjectBookStyle
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   en: string,
 *   desc: string,
 *   blurb: string,
 *   modules: string[],
 *   status: 'ready' | 'soon',
 *   classroomIntro?: string,
 *   book: SubjectBookStyle,
 * }} SubjectMeta
 */

/** @type {SubjectMeta[]} */
export const SUBJECTS = [
  {
    id: 'chemistry',
    name: '化学',
    en: 'CHEMISTRY',
    desc: '周期表 · 分子 · 课堂 · 对战',
    blurb:
      '从元素周期表走进分子结构，再到课堂讲解与元素对战。把抽象符号变成可动手的实验台，适合一边玩一边把基础化学建立起来。',
    modules: ['周期表', '分子', '课堂', '对战'],
    status: 'ready',
    book: {
      edge: '#d7efe9',
      backBg: '#0f766e',
      backInk: '236,254,255',
      spineBg: '#115e59',
      spineInk: '#99f6e4',
    },
  },
  {
    id: 'physics',
    name: '物理',
    en: 'PHYSICS',
    desc: '教室首页 · 模块筹备中',
    blurb:
      '力、电、光与实验台正在筹备中。计划用可拖拽的简易实验，把公式背后的直觉先建立起来，再慢慢接到课堂练习。',
    modules: ['力学', '电学', '实验'],
    status: 'ready',
    classroomIntro:
      '物理教室首页已开放。力学、电学与实验模块正在搭建，之后会在这里接上互动实验与练习。',
    book: {
      edge: '#e8e0ff',
      backBg: '#5b21b6',
      backInk: '237,233,254',
      spineBg: '#4c1d95',
      spineInk: '#c4b5fd',
    },
  },
  {
    id: 'biology',
    name: '生物',
    en: 'BIOLOGY',
    desc: '教室首页 · 模块筹备中',
    blurb:
      '从一颗细胞开始，走到遗传与生态。教室还在装修，未来会用图解与互动模型，把看不见的生命过程摊开给你看。',
    modules: ['细胞', '遗传', '生态'],
    status: 'ready',
    classroomIntro:
      '生物教室首页已开放。细胞、遗传与生态模块将陆续上线，先用首页熟悉学科脉络。',
    book: {
      edge: '#e2f5e8',
      backBg: '#166534',
      backInk: '220,252,231',
      spineBg: '#14532d',
      spineInk: '#86efac',
    },
  },
  {
    id: 'math',
    name: '数学',
    en: 'MATHEMATICS',
    desc: '函数 · 解析几何 · 三角 · 数列 · 立体 · 课堂',
    blurb:
      '高中数学实验室：函数画布、直线与圆、三角函数、数列与立体几何；另有课堂讲解与出题，与化学教室同一套操作习惯。',
    modules: ['函数画布', '直线与圆', '三角函数', '数列', '立体几何', '课堂'],
    status: 'ready',
    classroomIntro:
      '数学教室已开放。实验台可动手探究；「课堂」可做概念讲解与智能出题。',
    book: {
      edge: '#f5edd8',
      backBg: '#92400e',
      backInk: '255,251,235',
      spineBg: '#78350f',
      spineInk: '#fcd34d',
    },
  },
];

export function getSubject(id) {
  return SUBJECTS.find((s) => s.id === id) || null;
}
