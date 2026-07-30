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

const HOME_TAB = [{ id: 'home', label: '首页', panelId: 'panel-subject-home' }];

/** @type {Record<string, { name: string, defaultTabId: string, showTabBar: boolean, hasElectronOrder?: boolean, ai: boolean, tabs: Array<{ id: string, label: string, panelId: string }> }>} */
const SUBJECT_TAB_CATALOG = {
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
    defaultTabId: 'home',
    showTabBar: false,
    ai: true,
    tabs: HOME_TAB,
  },
};

const READY_SUBJECT_IDS = Object.keys(SUBJECT_TAB_CATALOG);

module.exports = {
  SUBJECT_TAB_CATALOG,
  READY_SUBJECT_IDS,
};
