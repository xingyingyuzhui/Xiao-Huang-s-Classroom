/**
 * 小黄的教室 - 主入口
 * 负责 Tab 切换和模块初始化
 *
 * 按需加载策略：
 * - 周期表、设置、品牌提示、侧栏抽屉：立即加载（轻量 / 首屏必需）
 * - 计算（molar-ui）：立即加载（无 Three.js 依赖，用户可能直接访问）
 * - 3D 分子、电子排布、课堂、元素乱斗：首次进入 Tab 时动态 import
 */

import './styles/index.css';
import { initPeriodicTable, scheduleFit } from './periodic-table.js';
import { initSettingsUI } from './settings.js';
import { initBrandTip } from './brand-tip.js';
import { initSideDrawers } from './side-drawer.js';
import { initMolarUI, runMolar, refreshMolarPresets } from './molar-ui.js';
import { createFeatureLoader } from './feature-loader.js';
import {
  showPanelLoading as showLoadingOn,
  hidePanelLoading as hideLoadingOn,
  showPanelError as showErrorOn,
} from './panel-loading.js';
import { createSubjectHub } from './subjects/hub.js';
import { bindSubjectChrome } from './subjects/chrome.js';
import { getCurrentSubjectId, setCurrentSubjectId } from './subjects/session.js';
import { getSubject } from './subjects/catalog.js';

const $ = (sel) => document.querySelector(sel);

const tabs = document.querySelectorAll('.tab');
const panels = {
  table: $('#panel-table'),
  molecule: $('#panel-molecule'),
  molar: $('#panel-molar'),
  electron: $('#panel-electron'),
  battle: $('#panel-battle'),
  ai: $('#panel-ai'),
};

// ── 按需加载器 ──
const loader = createFeatureLoader();

// ── 已加载模块引用（首次加载后填充）──
let molModule = null;    // molecule/list
let molAIModule = null;  // molecule/ai
let molRxnModule = null; // molecule/reactions
let elecListModule = null; // electron-list.js
let elecRendererModule = null; // electron-renderer.js
let aiClassroomModule = null;  // ai-classroom.js
let battleModule = null;       // element-battle.js

let electronViewer = null;
/** 当前 switchTab 序号，防止过期加载继续初始化 / 启动动画 */
let switchSeq = 0;

// ── resize 节流 ──
let resizePending = false;

function throttledResize() {
  if (resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => {
    resizePending = false;
    scheduleFit();
    if (molModule && !panels.molecule?.hidden) {
      molModule.getMolViewer()?.resize?.();
    }
    if (electronViewer && !panels.electron?.hidden) {
      electronViewer.resize();
    }
  });
}

// ── 面板加载状态（DOM 逻辑见 panel-loading.js，样式见 _layout.css）──

function showPanelLoading(name) {
  showLoadingOn(panels[name]);
}

function hidePanelLoading(name) {
  hideLoadingOn(panels[name]);
}

function showPanelError(name, message) {
  showErrorOn(panels[name], message);
}

/**
 * 加载功能并处理 loading / 错误 / 过期取消
 * @returns {Promise<boolean>} 是否在当前 Tab 请求下成功就绪
 */
async function runFeatureLoad(panelName, mySeq, ensureReady) {
  showPanelLoading(panelName);
  try {
    await ensureReady();
    if (mySeq !== switchSeq) {
      hidePanelLoading(panelName);
      return false;
    }
    hidePanelLoading(panelName);
    return true;
  } catch (err) {
    if (mySeq !== switchSeq) {
      hidePanelLoading(panelName);
      return false;
    }
    console.error(`[feature] ${panelName}`, err);
    showPanelError(panelName, err?.message || String(err));
    return false;
  }
}

// ── 分子 Tab 按需加载 ──

async function ensureMoleculeModules() {
  const { mod } = await loader.load('molecule', () =>
    import('./molecule/index.js'),
  );
  if (!molModule) {
    molModule = mod.list;
    molAIModule = mod.ai;
    molRxnModule = mod.reactions;
    molModule.setOnMoleculeChange(molRxnModule.onMoleculeChanged);
    molModule.initMoleculeList();
    molAIModule.initMoleculeAI();
    molRxnModule.initMoleculeReactions();
  }
}

// ── 电子排布 Tab 按需加载 ──

async function ensureElectronModules() {
  const { mod } = await loader.load('electron', () =>
    Promise.all([
      import('./electron-list.js'),
      import('./electron-renderer.js'),
    ]).then(([list, renderer]) => ({ list, renderer })),
  );
  if (!elecListModule) {
    elecListModule = mod.list;
    elecRendererModule = mod.renderer;
    await elecListModule.initElectronList();
  }
}

function ensureElectronViewerAndLoad(mySeq) {
  const root = $('#electron-root');
  if (!root || !elecRendererModule || !elecListModule) return;

  if (!electronViewer) {
    electronViewer = elecRendererModule.createElectronViewer(root);
    elecListModule.setElectronViewer(electronViewer);
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (mySeq !== switchSeq || !electronViewer) return;
      electronViewer.start();
      const z = elecListModule.getCurrentElementZ() || 1;
      elecListModule.loadElement(z);
      electronViewer.resize();
    });
  });
}

// ── 课堂 Tab 按需加载 ──

async function ensureClassroomModule() {
  const { mod } = await loader.load('classroom', () =>
    import('./ai-classroom.js'),
  );
  if (!aiClassroomModule) {
    aiClassroomModule = mod;
    aiClassroomModule.initAiClassroom();
  }
}

// ── 元素乱斗 Tab 按需加载 ──

async function ensureBattleModule() {
  const { mod } = await loader.load('battle', () =>
    import('./element-battle.js'),
  );
  if (!battleModule) {
    battleModule = mod;
    battleModule.initElementBattle();
  }
}

/**
 * 切换 Tab
 */
async function switchTab(name) {
  const mySeq = ++switchSeq;

  tabs.forEach((tab) => {
    const on = tab.dataset.tab === name;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
  });

  Object.entries(panels).forEach(([key, el]) => {
    if (!el) return;
    const on = key === name;
    if (on) {
      el.hidden = false;
      el.classList.remove('active');
      void el.offsetWidth;
      el.classList.add('active');
    } else {
      el.classList.remove('active');
      el.hidden = true;
    }
  });

  // 离开重模块页：停动画（不卸载模块，便于再进复用）
  if (name !== 'molecule' && molModule) {
    molModule.getMolViewer()?.stop();
  }
  if (name !== 'electron' && electronViewer) {
    electronViewer.stop();
  }

  // ── 分子 ──
  if (name === 'molecule') {
    const ok = await runFeatureLoad('molecule', mySeq, ensureMoleculeModules);
    if (!ok || mySeq !== switchSeq) return;
    molModule.ensureMolViewer();
    await molModule.ensureDefaultMolecule();
    if (mySeq !== switchSeq) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (mySeq !== switchSeq) return;
        const viewer = molModule.getMolViewer();
        if (viewer) {
          viewer.start();
          viewer.resize();
        }
      });
    });
  }

  // ── 计算 ──
  if (name === 'molar') {
    refreshMolarPresets().catch(console.warn);
  }

  // ── 电子排布 ──
  if (name === 'electron') {
    const ok = await runFeatureLoad('electron', mySeq, ensureElectronModules);
    if (!ok || mySeq !== switchSeq) return;
    ensureElectronViewerAndLoad(mySeq);
  }

  // ── 课堂 ──
  if (name === 'ai') {
    await runFeatureLoad('ai', mySeq, ensureClassroomModule);
  }

  // ── 元素乱斗 ──
  if (name === 'battle') {
    await runFeatureLoad('battle', mySeq, ensureBattleModule);
  }
}

/**
 * 初始化应用
 */
async function init() {
  // 立即初始化轻量模块
  initPeriodicTable();
  initMolarUI();
  initBrandTip();

  // 侧栏抽屉：resize 回调中访问已加载模块，未加载则跳过
  initSideDrawers({
    onToggle: (key, collapsed) => {
      if (collapsed && key === 'molecule' && molModule) molModule.setMolEditMode(false);
      if (collapsed && key === 'electron' && elecListModule) elecListModule.setElectronEditMode(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (key === 'table' && !panels.table?.hidden) scheduleFit();
          if (key === 'molecule' && !panels.molecule?.hidden && molModule) {
            molModule.getMolViewer()?.resize?.();
          }
          if (key === 'electron' && !panels.electron?.hidden && electronViewer) {
            electronViewer.resize();
          }
        });
      });
    },
  });

  const settingsApi = await initSettingsUI({
    onDefaultPageChange: () => {},
  });

  /** @type {'hub' | 'lab' | 'entering' | 'returning'} */
  let shellMode = 'hub';
  let subjectChrome;
  /** 进入实验室异步世代：过期的 switchTab 结果不得再改壳 */
  let labEnterSeq = 0;

  const subjectHub = createSubjectHub({
    select: $,
    onEnterSubject: (id) => enterSubject(id),
  });

  subjectHub.setRevealHubHandler(() => {
    /* 仅在返回转场帷幕已不透明后调用：幕下卸教室、露大厅 */
    shellMode = 'returning';
    setCurrentSubjectId(null);
    hideAllLabPanels();
    subjectChrome.sync('hub', null);
  });

  subjectChrome = bindSubjectChrome({
    select: $,
    onBackToHub: () => {
      settingsApi.closeDrawer?.();
      if (shellMode === 'lab' || shellMode === 'entering') {
        returnToHubAnimated();
      } else if (shellMode !== 'returning') {
        showHub();
      }
    },
  });

  function hideAllLabPanels() {
    Object.values(panels).forEach((el) => {
      if (!el) return;
      el.hidden = true;
      el.classList.remove('active');
    });
    if (molModule) molModule.getMolViewer()?.stop();
    if (electronViewer) electronViewer.stop();
  }

  function showHub() {
    labEnterSeq += 1;
    shellMode = 'hub';
    setCurrentSubjectId(null);
    hideAllLabPanels();
    subjectHub.show();
    subjectChrome.sync('hub', null);
  }

  function returnToHubAnimated() {
    if (shellMode === 'returning') return;
    const id = getCurrentSubjectId() || 'chemistry';
    labEnterSeq += 1; // 取消进行中的 enterSubject
    shellMode = 'returning';
    // 帷幕不透明后 onRevealHub 再卸教室；大厅在幕下合书
    subjectHub.playReturnFromLab({
      subjectId: id,
      onDone: () => {
        shellMode = 'hub';
        setCurrentSubjectId(null);
        hideAllLabPanels();
        document.documentElement.dataset.shell = 'hub';
        // 确保大厅根节点可见（onRevealHub 应已处理；此处兜底）
        const hubRoot = $('#subjectHub');
        if (hubRoot) {
          hubRoot.hidden = false;
          hubRoot.setAttribute('aria-hidden', 'false');
        }
        document.body.classList.remove(
          'transit',
          'detail-open',
          'bookshelf-entering',
          'bookshelf-dive-deep',
        );
        subjectChrome.sync('hub', null);
      },
    });
  }

  /**
   * 帷幕不透明后调用：在遮罩下挂载实验室，避免白页空镜。
   * @param {string} id
   */
  async function enterSubject(id) {
    const meta = getSubject(id);
    if (!meta || meta.status !== 'ready') return;
    if (shellMode === 'returning') return;

    const seq = ++labEnterSeq;
    shellMode = 'entering';
    setCurrentSubjectId(id);

    /* 先切壳再加载 Tab：此时 enter-fx 帷幕应已不透明 */
    subjectHub.hide();
    document.documentElement.dataset.shell = 'lab';
    subjectChrome.sync('lab', id);

    try {
      const defaultPage = await settingsApi.getDefaultPage();
      if (seq !== labEnterSeq) return;

      if (defaultPage === 'molecule') {
        await switchTab('molecule');
      } else if (defaultPage === 'molar') {
        await switchTab('molar');
        runMolar();
      } else if (defaultPage === 'electron') {
        await switchTab('electron');
      } else if (defaultPage === 'battle') {
        await switchTab('battle');
      } else if (defaultPage === 'ai') {
        await switchTab('ai');
      } else {
        await switchTab('table');
        runMolar();
      }

      if (seq !== labEnterSeq) return;
      shellMode = 'lab';
    } catch (err) {
      console.error('enterSubject failed', err);
      if (seq === labEnterSeq) {
        /* 失败时仍落在 lab 壳，避免卡在 entering */
        shellMode = 'lab';
      }
    }
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      if (shellMode !== 'lab') return;
      switchTab(tab.dataset.tab);
      if (tab.dataset.tab === 'table') {
        requestAnimationFrame(() => scheduleFit());
      }
    });
  });

  window.addEventListener('resize', throttledResize);

  // v1：始终先到学科大厅（不自动跳进上次学科）
  showHub();

  await revealApp();
}

/** 等字体与首帧布局后再显示，减少刷新闪屏 */
async function revealApp() {
  try {
    if (document.fonts?.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise((r) => setTimeout(r, 1200)),
      ]);
    }
  } catch {
    /* ignore */
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  document.documentElement.classList.remove('app-booting');
  document.documentElement.classList.add('app-ready');
  scheduleFit();
}

init().catch((err) => {
  console.error(err);
  document.documentElement.classList.remove('app-booting');
  document.documentElement.classList.add('app-ready');
});
