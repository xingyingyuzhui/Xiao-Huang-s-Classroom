/**
 * 各学科 Tab / 默认页元数据（唯一数据源）
 */

const CHEMISTRY_TABS = [
  { id: 'table', label: '元素周期表', panelId: 'panel-table' },
  { id: 'molecule', label: '3D 分子', panelId: 'panel-molecule' },
  { id: 'molar', label: '计算', panelId: 'panel-molar' },
  { id: 'electron', label: '电子排布', panelId: 'panel-electron' },
  { id: 'battle', label: '元素乱斗', panelId: 'panel-battle' },
  { id: 'ai', label: '课堂', panelId: 'panel-ai' },
];

const MATH_TABS = [
  { id: 'graph', label: '函数画布', panelId: 'panel-math-graph' },
  { id: 'plane', label: '直线与圆', panelId: 'panel-math-plane' },
  { id: 'trig', label: '三角函数', panelId: 'panel-math-trig' },
  { id: 'sequence', label: '数列', panelId: 'panel-math-sequence' },
  { id: 'solid', label: '立体几何', panelId: 'panel-math-solid' },
  { id: 'ai', label: '课堂', panelId: 'panel-math-ai' },
];

const HOME_TAB = [{ id: 'home', label: '首页', panelId: 'panel-subject-home' }];

/** @type {Record<string, { name: string, defaultTabId: string, showTabBar: boolean, hasElectronOrder?: boolean, ai: boolean, tabs: Array<{ id: string, label: string, panelId: string }> }>} */
export const SUBJECT_TAB_CATALOG = {
  chemistry: {
    name: '化学',
    defaultTabId: 'table',
    showTabBar: true,
    hasElectronOrder: true,
    ai: true,
    tabs: CHEMISTRY_TABS,
  },
  physics: {
    name: '物理',
    defaultTabId: 'home',
    showTabBar: false,
    ai: true,
    tabs: HOME_TAB,
  },
  biology: {
    name: '生物',
    defaultTabId: 'home',
    showTabBar: false,
    ai: true,
    tabs: HOME_TAB,
  },
  math: {
    name: '数学',
    defaultTabId: 'graph',
    showTabBar: true,
    ai: true,
    tabs: MATH_TABS,
  },
};

export const READY_SUBJECT_IDS = Object.keys(SUBJECT_TAB_CATALOG);
