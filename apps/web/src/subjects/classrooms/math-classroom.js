/**
 * 数学学科教室：多 Tab 实验室 + 课堂（对齐化学）
 */

import {
  getDefaultPageOptions,
  getDefaultTabId,
  getSubjectCapabilities,
} from '@xiaohuang/subject-settings';
import { createTabbedClassroom } from './tabbed-classroom.js';
import { mountPartialHtml, unhidePanelHost } from './panel-mount.js';
import { applyLabAction as bridgeApply, captureLabSnapshot } from '../../math/shared/lab-bridge.js';
import { ensureMathFloatCardsBound } from '../../math/shared/float-cards.js';
import { mountMathNumKeypads } from '../../math/shared/num-keypad.js';
import { dismissObjectStyleBubble } from '../../math/shared/object-style-panel.js';
import { dismissBoardCompass } from '../../math/shared/board-compass.js';
import { dismissAxisLegendBubble } from '../../math/shared/axis-legend-settings.js';
import { dismissBoardNotesMode } from '../../math/shared/board-notes.js';
import panelsHtml from './partials/math-panels.partial.html?raw';

function dismissMathOverlays() {
  dismissObjectStyleBubble();
  dismissBoardCompass();
  dismissAxisLegendBubble();
  dismissBoardNotesMode();
  // 关闭添加函数 / AI 生成弹窗（纯 DOM，不依赖 graph 是否已加载）
  for (const [bd, md] of [
    ['mathFnAddBackdrop', 'mathFnAddModal'],
    ['mathFnAiBackdrop', 'mathFnAiModal'],
  ]) {
    const backdrop = document.getElementById(bd);
    const modal = document.getElementById(md);
    backdrop?.classList.remove('is-open');
    modal?.classList.remove('is-open');
    backdrop?.setAttribute('aria-hidden', 'true');
    modal?.setAttribute('aria-hidden', 'true');
  }
}

let panelsMounted = false;

function ensureMathPanelsMounted() {
  if (panelsMounted) return;
  const host = document.getElementById('lab-math-root');
  mountPartialHtml(host, panelsHtml, 'data-mounted=math-panels');
  ensureMathFloatCardsBound();
  mountMathNumKeypads(host || document);
  panelsMounted = true;
}

function showMathLabHost() {
  unhidePanelHost('#lab-math-root');
}

function hideMathLabHost() {
  const host = document.getElementById('lab-math-root');
  if (host) host.hidden = true;
}

/**
 * @param {{ select: (sel: string) => Element | null }} deps
 */
export function createMathClassroom({ select }) {
  const $ = select;

  /** @type {typeof import('../../math/graph/index.js') | null} */
  let graphMod = null;
  /** @type {typeof import('../../math/plane/index.js') | null} */
  let planeMod = null;
  /** @type {typeof import('../../math/trig/index.js') | null} */
  let trigMod = null;
  /** @type {typeof import('../../math/sequence/index.js') | null} */
  let sequenceMod = null;
  /** @type {typeof import('../../math/solid/index.js') | null} */
  let solidMod = null;
  /** @type {typeof import('../../math/classroom/entry.js') | null} */
  let classroomMod = null;

  const panels = {
    graph: () => $('#panel-math-graph') || document.getElementById('panel-math-graph'),
    plane: () => $('#panel-math-plane') || document.getElementById('panel-math-plane'),
    trig: () => $('#panel-math-trig') || document.getElementById('panel-math-trig'),
    sequence: () => $('#panel-math-sequence') || document.getElementById('panel-math-sequence'),
    solid: () => $('#panel-math-solid') || document.getElementById('panel-math-solid'),
    ai: () => $('#panel-math-ai') || document.getElementById('panel-math-ai'),
  };

  function panelEl(key) {
    return panels[key]?.() ?? null;
  }

  let resizePending = false;
  /** @type {ReturnType<typeof createTabbedClassroom> | null} */
  let classroom = null;

  async function ensureGraph(loader) {
    const { mod } = await loader.load('math-graph', () => import('../../math/graph/index.js'));
    if (!graphMod) {
      graphMod = mod;
      graphMod.initGraphUI();
    }
  }

  async function ensurePlane(loader) {
    const { mod } = await loader.load('math-plane', () => import('../../math/plane/index.js'));
    if (!planeMod) {
      planeMod = mod;
      planeMod.initPlaneUI();
    }
  }

  async function ensureTrig(loader) {
    const { mod } = await loader.load('math-trig', () => import('../../math/trig/index.js'));
    if (!trigMod) {
      trigMod = mod;
      trigMod.initTrigUI();
    }
  }

  async function ensureSequence(loader) {
    const { mod } = await loader.load('math-sequence', () => import('../../math/sequence/index.js'));
    if (!sequenceMod) {
      sequenceMod = mod;
      sequenceMod.initSequenceUI();
    }
  }

  async function ensureSolid(loader) {
    const { mod } = await loader.load('math-solid', () => import('../../math/solid/index.js'));
    if (!solidMod) {
      solidMod = mod;
      solidMod.initSolidUI();
    }
  }

  function labMods() {
    return {
      graph: graphMod,
      plane: planeMod,
      trig: trigMod,
      sequence: sequenceMod,
      solid: solidMod,
      activeTabId: null,
      switchTab: async (tabId) => {
        if (classroom?.switchTab) await classroom.switchTab(tabId);
      },
    };
  }

  async function ensureClassroom(loader) {
    const { mod } = await loader.load('math-classroom', () =>
      import('../../math/classroom/entry.js'),
    );
    classroomMod = mod;
    classroomMod.initMathClassroom({
      switchTab: async (tabId) => {
        if (classroom?.switchTab) await classroom.switchTab(tabId);
      },
      getLabSnapshot: () => {
        // 尝试从各已加载模块取快照（优先当前可见面板）
        const order = ['graph', 'plane', 'trig', 'sequence', 'solid'];
        for (const key of order) {
          const panel = panelEl(key);
          if (panel && !panel.hidden) {
            const snap = captureLabSnapshot({
              ...labMods(),
              activeTabId: key,
            });
            if (snap) return snap;
          }
        }
        return captureLabSnapshot(labMods());
      },
      applyLabAction: async (action) => {
        // 确保目标模块已加载
        const tab =
          action.tab ||
          (action.type === 'setGraph'
            ? 'graph'
            : action.type === 'setTrig'
              ? 'trig'
              : action.type === 'setSequence'
                ? 'sequence'
                : action.type === 'setSolid'
                  ? 'solid'
                  : action.type === 'setPlane'
                    ? 'plane'
                    : null);
        if (tab && classroom?.switchTab) {
          await classroom.switchTab(tab);
          // activateTab 会 ensure 模块
          await new Promise((r) => setTimeout(r, 80));
        }
        return bridgeApply(action, {
          graph: graphMod,
          plane: planeMod,
          trig: trigMod,
          sequence: sequenceMod,
          solid: solidMod,
          switchTab: async (id) => {
            if (classroom?.switchTab) await classroom.switchTab(id);
          },
        });
      },
    });
  }

  function disposeAll() {
    graphMod?.disposeGraph?.();
    planeMod?.disposePlane?.();
    trigMod?.disposeTrig?.();
    sequenceMod?.disposeSequence?.();
    solidMod?.disposeSolid?.();
    classroomMod?.disposeMathClassroom?.();
    graphMod = null;
    planeMod = null;
    trigMod = null;
    sequenceMod = null;
    solidMod = null;
    classroomMod = null;
  }

  classroom = createTabbedClassroom({
    subjectId: 'math',
    showTabBar: true,
    panels: {
      get graph() {
        return panelEl('graph');
      },
      get plane() {
        return panelEl('plane');
      },
      get trig() {
        return panelEl('trig');
      },
      get sequence() {
        return panelEl('sequence');
      },
      get solid() {
        return panelEl('solid');
      },
      get ai() {
        return panelEl('ai');
      },
    },
    defaultPageOptions: getDefaultPageOptions('math'),
    defaultTabId: getDefaultTabId('math'),

    boot() {
      ensureMathPanelsMounted();
    },

    deactivateTab() {
      // 切 Tab 时收起气泡 / 罗盘
      dismissMathOverlays();
    },

    async activateTab(tabId, ctx) {
      // 进入新 Tab 再兜底一次（含首次 enter / 同 id 重入）
      dismissMathOverlays();
      const loader = ctx.loader;
      if (tabId === 'graph') {
        const ok = await ctx.runFeatureLoad('graph', () => ensureGraph(loader));
        if (!ok || ctx.isStale()) return;
        requestAnimationFrame(() => graphMod?.resizeGraph?.());
      }
      if (tabId === 'plane') {
        const ok = await ctx.runFeatureLoad('plane', () => ensurePlane(loader));
        if (!ok || ctx.isStale()) return;
        requestAnimationFrame(() => planeMod?.resizePlane?.());
      }
      if (tabId === 'trig') {
        const ok = await ctx.runFeatureLoad('trig', () => ensureTrig(loader));
        if (!ok || ctx.isStale()) return;
        requestAnimationFrame(() => trigMod?.resizeTrig?.());
      }
      if (tabId === 'sequence') {
        const ok = await ctx.runFeatureLoad('sequence', () => ensureSequence(loader));
        if (!ok || ctx.isStale()) return;
        requestAnimationFrame(() => sequenceMod?.resizeSequence?.());
      }
      if (tabId === 'solid') {
        const ok = await ctx.runFeatureLoad('solid', () => ensureSolid(loader));
        if (!ok || ctx.isStale()) return;
        requestAnimationFrame(() => solidMod?.resizeSolid?.());
      }
      if (tabId === 'ai') {
        await ctx.runFeatureLoad('ai', () => ensureClassroom(loader));
      }
    },

    onResize() {
      if (resizePending) return;
      resizePending = true;
      requestAnimationFrame(() => {
        resizePending = false;
        const g = panelEl('graph');
        const p = panelEl('plane');
        const t = panelEl('trig');
        const s = panelEl('sequence');
        const so = panelEl('solid');
        if (g && !g.hidden) graphMod?.resizeGraph?.();
        if (p && !p.hidden) planeMod?.resizePlane?.();
        if (t && !t.hidden) trigMod?.resizeTrig?.();
        if (s && !s.hidden) sequenceMod?.resizeSequence?.();
        if (so && !so.hidden) solidMod?.resizeSolid?.();
      });
    },

    onSideDrawerToggle() {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const g = panelEl('graph');
          const p = panelEl('plane');
          const t = panelEl('trig');
          const s = panelEl('sequence');
          const so = panelEl('solid');
          if (g && !g.hidden) graphMod?.resizeGraph?.();
          if (p && !p.hidden) planeMod?.resizePlane?.();
          if (t && !t.hidden) trigMod?.resizeTrig?.();
          if (s && !s.hidden) sequenceMod?.resizeSequence?.();
          if (so && !so.hidden) solidMod?.resizeSolid?.();
        });
      });
    },
  });

  return {
    ...classroom,
    capabilities: getSubjectCapabilities('math'),
    async enter(ctx) {
      ensureMathPanelsMounted();
      showMathLabHost();
      return classroom.enter(ctx);
    },
    leave() {
      dismissMathOverlays();
      classroom.leave();
      disposeAll();
      hideMathLabHost();
    },
    hidePanels() {
      hideMathLabHost();
    },
  };
}
