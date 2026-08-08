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
import type { ClassroomEnterContext } from './types.js';
import type { TabActivateContext } from './tabbed-classroom.js';

function dismissMathOverlays(): void {
  dismissObjectStyleBubble();
  dismissBoardCompass();
  dismissAxisLegendBubble();
  dismissBoardNotesMode();
  // 关闭添加函数 / AI 生成弹窗（纯 DOM，不依赖 graph 是否已加载）
  for (const [bd, md] of [
    ['mathFnAddBackdrop', 'mathFnAddModal'],
    ['mathFnAiBackdrop', 'mathFnAiModal'],
  ] as const) {
    const backdrop = document.getElementById(bd);
    const modal = document.getElementById(md);
    backdrop?.classList.remove('is-open');
    modal?.classList.remove('is-open');
    backdrop?.setAttribute('aria-hidden', 'true');
    modal?.setAttribute('aria-hidden', 'true');
  }
}

let panelsMounted = false;

function ensureMathPanelsMounted(): void {
  if (panelsMounted) return;
  const host = document.getElementById('lab-math-root');
  mountPartialHtml(host, panelsHtml, 'data-mounted=math-panels');
  ensureMathFloatCardsBound();
  mountMathNumKeypads(host || document);
  panelsMounted = true;
}

function showMathLabHost(): void {
  unhidePanelHost('#lab-math-root');
}

function hideMathLabHost(): void {
  const host = document.getElementById('lab-math-root');
  if (host) host.hidden = true;
}

export interface MathClassroomOptions {
  select: (sel: string) => Element | null;
}

type GraphModule = typeof import('../../math/graph/index.js');
type PlaneModule = typeof import('../../math/plane/index.js');
type TrigModule = typeof import('../../math/trig/index.js');
type SequenceModule = typeof import('../../math/sequence/index.js');
type SolidModule = typeof import('../../math/solid/index.js');
type ClassroomModule = typeof import('../../math/classroom/entry.js');

export function createMathClassroom({ select }: MathClassroomOptions) {
  // 面板均为真实 HTMLElement（hidden 等成员需要）
  const $ = select as (sel: string) => HTMLElement | null;

  let graphMod: GraphModule | null = null;
  let planeMod: PlaneModule | null = null;
  let trigMod: TrigModule | null = null;
  let sequenceMod: SequenceModule | null = null;
  let solidMod: SolidModule | null = null;
  let classroomMod: ClassroomModule | null = null;

  const panels: Record<string, () => HTMLElement | null> = {
    graph: () => $('#panel-math-graph') || document.getElementById('panel-math-graph'),
    plane: () => $('#panel-math-plane') || document.getElementById('panel-math-plane'),
    trig: () => $('#panel-math-trig') || document.getElementById('panel-math-trig'),
    sequence: () => $('#panel-math-sequence') || document.getElementById('panel-math-sequence'),
    solid: () => $('#panel-math-solid') || document.getElementById('panel-math-solid'),
    ai: () => $('#panel-math-ai') || document.getElementById('panel-math-ai'),
  };

  function panelEl(key: string): HTMLElement | null {
    return panels[key]?.() ?? null;
  }

  let resizePending = false;
  let classroom: ReturnType<typeof createTabbedClassroom> | null = null;

  async function ensureGraph(loader: TabActivateContext['loader']): Promise<void> {
    const { mod } = await loader.load('math-graph', () => import('../../math/graph/index.js'));
    if (!graphMod) {
      graphMod = mod as GraphModule;
      graphMod.initGraphUI();
    }
  }

  async function ensurePlane(loader: TabActivateContext['loader']): Promise<void> {
    const { mod } = await loader.load('math-plane', () => import('../../math/plane/index.js'));
    if (!planeMod) {
      planeMod = mod as PlaneModule;
      planeMod.initPlaneUI();
    }
  }

  async function ensureTrig(loader: TabActivateContext['loader']): Promise<void> {
    const { mod } = await loader.load('math-trig', () => import('../../math/trig/index.js'));
    if (!trigMod) {
      trigMod = mod as TrigModule;
      trigMod.initTrigUI();
    }
  }

  async function ensureSequence(loader: TabActivateContext['loader']): Promise<void> {
    const { mod } = await loader.load('math-sequence', () => import('../../math/sequence/index.js'));
    if (!sequenceMod) {
      sequenceMod = mod as SequenceModule;
      sequenceMod.initSequenceUI();
    }
  }

  async function ensureSolid(loader: TabActivateContext['loader']): Promise<void> {
    const { mod } = await loader.load('math-solid', () => import('../../math/solid/index.js'));
    if (!solidMod) {
      solidMod = mod as SolidModule;
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
      switchTab: async (tabId: string) => {
        if (classroom?.switchTab) await classroom.switchTab(tabId);
      },
    };
  }

  async function ensureClassroom(loader: TabActivateContext['loader']): Promise<void> {
    const { mod } = await loader.load('math-classroom', () =>
      import('../../math/classroom/entry.js'),
    );
    classroomMod = mod as ClassroomModule;
    classroomMod.initMathClassroom({
      switchTab: async (tabId: string) => {
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
          switchTab: async (id: string) => {
            if (classroom?.switchTab) await classroom.switchTab(id);
          },
        });
      },
    });
  }

  function disposeAll(): void {
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

    deactivateTab(): void {
      // 切 Tab 时收起气泡 / 罗盘
      dismissMathOverlays();
    },

    async activateTab(tabId: string, ctx: TabActivateContext): Promise<void> {
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

    onResize(): void {
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

    onSideDrawerToggle(): void {
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
    async enter(ctx: ClassroomEnterContext): Promise<void> {
      ensureMathPanelsMounted();
      showMathLabHost();
      return classroom.enter(ctx);
    },
    leave(): void {
      dismissMathOverlays();
      classroom.leave();
      disposeAll();
      hideMathLabHost();
    },
    hidePanels(): void {
      hideMathLabHost();
    },
  };
}
