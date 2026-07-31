/**
 * 数学课堂 · 讲解与出题主题（课标语言）+ 实验台示范动作（P1）
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   blurb: string,
 *   labTab?: string,
 *   labLabel?: string,
 *   quizTopics?: string[],
 *   labActions?: Array<import('../shared/lab-bridge.js').LabAction & { label?: string }>,
 * }} MathTopic
 */

/** @type {MathTopic[]} */
export const MATH_CLASSROOM_TOPICS = [
  {
    id: 'quadratic',
    label: '二次函数与方程',
    blurb: '图象、顶点、判别式、零点与不等式解集',
    labTab: 'graph',
    labLabel: '函数画布',
    quizTopics: ['二次函数与方程', '二次函数图象与性质'],
    labActions: [
      {
        type: 'setGraph',
        tab: 'graph',
        label: '示范：y=(x−1)(x−3) 过两零点',
        preset: 'quadratic',
        coeffs: { a: 1, b: -4, c: 3 },
      },
      {
        type: 'setGraph',
        tab: 'graph',
        label: '示范：开口向下 y=−x²+4',
        preset: 'quadratic',
        coeffs: { a: -1, b: 0, c: 4 },
      },
    ],
  },
  {
    id: 'function-basics',
    label: '函数概念与性质',
    blurb: '定义域值域、单调性、奇偶性与图象变换',
    labTab: 'graph',
    labLabel: '函数画布',
    quizTopics: ['函数概念与性质'],
    labActions: [
      {
        type: 'setGraph',
        tab: 'graph',
        label: '示范：一次函数 y=2x−1',
        preset: 'linear',
        coeffs: { a: 2, b: -1, c: 0 },
      },
    ],
  },
  {
    id: 'exp-log',
    label: '指数与对数',
    blurb: '幂指对性质、互化与图象',
    labTab: 'graph',
    labLabel: '函数画布',
    quizTopics: ['指数函数', '对数函数'],
    labActions: [
      {
        type: 'setGraph',
        tab: 'graph',
        label: '示范：指数 y=e^{0.5x}',
        preset: 'exp',
        coeffs: { a: 1, b: 0.5, c: 0 },
      },
      {
        type: 'setGraph',
        tab: 'graph',
        label: '示范：对数 y=ln x',
        preset: 'log',
        coeffs: { a: 1, b: 0, c: 0 },
      },
    ],
  },
  {
    id: 'trigonometry',
    label: '三角函数',
    blurb: '单位圆定义、图象、诱导公式与特殊角',
    labTab: 'trig',
    labLabel: '三角函数',
    quizTopics: ['三角函数', '单位圆与特殊角'],
    labActions: [
      { type: 'setTrig', tab: 'trig', label: '示范：θ=30°', deg: 30 },
      { type: 'setTrig', tab: 'trig', label: '示范：θ=90°', deg: 90 },
    ],
  },
  {
    id: 'line-circle',
    label: '直线与圆',
    blurb: '直线方程、圆方程、位置关系与点到直线距离',
    labTab: 'plane',
    labLabel: '直线与圆',
    quizTopics: ['直线与圆', '点到直线距离'],
    labActions: [
      {
        type: 'setPlane',
        tab: 'plane',
        label: '示范：复位经典点位',
      },
    ],
  },
  {
    id: 'sequences',
    label: '等差与等比数列',
    blurb: '通项、前 n 项和与生长直觉',
    labTab: 'sequence',
    labLabel: '数列',
    quizTopics: ['等差数列', '等比数列'],
    labActions: [
      {
        type: 'setSequence',
        tab: 'sequence',
        label: '示范：等差 a₁=2,d=3,n=5',
        kind: 'arith',
        a1: 2,
        step: 3,
        n: 5,
      },
      {
        type: 'setSequence',
        tab: 'sequence',
        label: '示范：等比 a₁=1,q=2,n=6',
        kind: 'geom',
        a1: 1,
        step: 2,
        n: 6,
      },
    ],
  },
  {
    id: 'solid',
    label: '立体几何初步',
    blurb: '柱体锥体、表面积体积与线面关系直觉',
    labTab: 'solid',
    labLabel: '立体几何',
    quizTopics: ['立体几何', '棱柱棱锥体积'],
    labActions: [
      {
        type: 'setSolid',
        tab: 'solid',
        label: '示范：正方体 a=2',
        solidType: 'cube',
        dims: { a: 2, b: 2, c: 2 },
      },
      {
        type: 'setSolid',
        tab: 'solid',
        label: '示范：正四棱锥',
        solidType: 'pyramid',
        dims: { a: 2.4, b: 1.6, c: 2.5 },
      },
    ],
  },
  {
    id: 'vectors',
    label: '平面向量',
    blurb: '运算、数量积与几何意义',
    quizTopics: ['平面向量'],
  },
  {
    id: 'probability',
    label: '概率初步',
    blurb: '样本空间、古典概型与频率估计',
    quizTopics: ['概率初步', '古典概型'],
  },
  {
    id: 'derivatives',
    label: '导数及其应用',
    blurb: '瞬时变化率、切线、极值与单调性',
    labTab: 'graph',
    labLabel: '函数画布',
    quizTopics: ['导数及其应用'],
    labActions: [
      {
        type: 'setGraph',
        tab: 'graph',
        label: '示范：二次 y=x²−2x 看极值',
        preset: 'quadratic',
        coeffs: { a: 1, b: -2, c: 0 },
      },
    ],
  },
];

export const MATH_GRADES = [
  { id: 1, label: '高一' },
  { id: 2, label: '高二' },
  { id: 3, label: '高三' },
];

export const MATH_DIFFICULTIES = [
  { id: 'basic', label: '基础', desc: '概念辨析与直接套公式' },
  { id: 'medium', label: '中档', desc: '课后练习与简单综合' },
  { id: 'hard', label: '较难', desc: '高考常见综合设问' },
];

/**
 * @param {string} id
 * @returns {MathTopic | null}
 */
export function getMathTopic(id) {
  return MATH_CLASSROOM_TOPICS.find((t) => t.id === id) ?? null;
}
