/**
 * 化学学科教室：挂载 partial 面板后初始化实验室 Tab
 */

import { initPeriodicTable, scheduleFit } from '../../chemistry/periodic-table/index.js';
import { initMolarUI, runMolar, refreshMolarPresets } from '../../chemistry/molar/ui.js';
import { getDefaultPageOptions, getDefaultTabId } from '@xiaohuang/subject-settings';
import { createTabbedClassroom } from './tabbed-classroom.js';
import { mountPartialHtml, unhidePanelHost } from './panel-mount.js';
import modalsHtml from './partials/chemistry-modals.partial.html?raw';
import panelsHtml from './partials/chemistry-panels.partial.html?raw';
import type { ClassroomEnterContext } from './types.js';
import type { TabActivateContext } from './tabbed-classroom.js';

let panelsMounted = false;

function ensureChemistryPanelsMounted(): void {
  if (panelsMounted) return;
  const chromeHost = document.getElementById('lab-chemistry-chrome');
  const panelsHost = document.getElementById('lab-panels-root');
  mountPartialHtml(chromeHost, modalsHtml, 'data-mounted=chemistry-modals');
  mountPartialHtml(panelsHost, panelsHtml, 'data-mounted=chemistry-panels');
  panelsMounted = true;
}

function showChemistryLabHosts(): void {
  unhidePanelHost('#lab-chemistry-chrome');
  unhidePanelHost('#lab-panels-root');
}

function hideChemistryLabHosts(): void {
  const chromeHost = document.getElementById('lab-chemistry-chrome');
  const panelsHost = document.getElementById('lab-panels-root');
  if (chromeHost) chromeHost.hidden = true;
  if (panelsHost) panelsHost.hidden = true;
}

export interface ChemistryClassroomOptions {
  select: (sel: string) => Element | null;
}

type MoleculeListModule = typeof import('../../chemistry/molecule/list.js');
type MoleculeAiModule = typeof import('../../chemistry/molecule/ai.js');
type MoleculeReactionsModule = typeof import('../../chemistry/molecule/reactions.js');
type ElectronListModule = typeof import('../../chemistry/electron/list.js');
type ElectronRendererModule = typeof import('../../chemistry/electron/renderer.js');
type AiClassroomModule = typeof import('../../chemistry/ai-classroom/entry.js');
type BattleModule = typeof import('../../chemistry/battle/index.js');
type ElectronViewer = ReturnType<ElectronRendererModule['createElectronViewer']>;

export function createChemistryClassroom({ select }: ChemistryClassroomOptions) {
  // 面板均为真实 HTMLElement（hidden/offsetWidth 等成员需要）
  const $ = select as (sel: string) => HTMLElement | null;

  const panels: Record<string, () => HTMLElement | null> = {
    table: () => $('#panel-table'),
    molecule: () => $('#panel-molecule'),
    molar: () => $('#panel-molar'),
    electron: () => $('#panel-electron'),
    battle: () => $('#panel-battle'),
    ai: () => $('#panel-ai'),
  };

  let molModule: MoleculeListModule | null = null;
  let molAIModule: MoleculeAiModule | null = null;
  let molRxnModule: MoleculeReactionsModule | null = null;
  let elecListModule: ElectronListModule | null = null;
  let elecRendererModule: ElectronRendererModule | null = null;
  let aiClassroomModule: AiClassroomModule | null = null;
  let battleModule: BattleModule | null = null;
  let electronViewer: ElectronViewer | null = null;
  let resizePending = false;

  function panelEl(key: string): HTMLElement | null {
    return panels[key]?.() ?? null;
  }

  async function ensureMoleculeModules(loader: TabActivateContext['loader']): Promise<void> {
    const { mod } = await loader.load('molecule', () =>
      import('../../chemistry/molecule/index.js'),
    );
    if (!molModule) {
      // mod 来自 JS feature-loader（any）；模块形状由下方 typeof 类型锁定
      molModule = mod.list as MoleculeListModule;
      molAIModule = mod.ai as MoleculeAiModule;
      molRxnModule = mod.reactions as MoleculeReactionsModule;
      molModule.setOnMoleculeChange(molRxnModule.onMoleculeChanged);
      molModule.initMoleculeList();
      molAIModule.initMoleculeAI();
      molRxnModule.initMoleculeReactions();
    }
  }

  async function ensureElectronModules(loader: TabActivateContext['loader']): Promise<void> {
    const { mod } = await loader.load('electron', () =>
      Promise.all([
        import('../../chemistry/electron/list.js'),
        import('../../chemistry/electron/renderer.js'),
      ]).then(([list, renderer]) => ({ list, renderer })),
    );
    if (!elecListModule) {
      elecListModule = mod.list as ElectronListModule;
      elecRendererModule = mod.renderer as ElectronRendererModule;
      await elecListModule.initElectronList();
    }
  }

  function ensureElectronViewerAndLoad(mySeq: number, switchSeq: number): void {
    const root = $('#electron-root');
    if (!root || !elecRendererModule || !elecListModule) return;

    // 提前捕获非空引用：rAF 回调内对模块级 let 不做窄化
    const renderer = elecRendererModule;
    const list = elecListModule;

    if (!electronViewer) {
      electronViewer = renderer.createElectronViewer(root);
      list.setElectronViewer(electronViewer);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (mySeq !== switchSeq || !electronViewer) return;
        electronViewer.start();
        const z = list.getCurrentElementZ() || 1;
        list.loadElement(z);
        electronViewer.resize();
      });
    });
  }

  async function ensureClassroomModule(loader: TabActivateContext['loader']): Promise<void> {
    const { mod } = await loader.load('classroom', () =>
      import('../../chemistry/ai-classroom/entry.js'),
    );
    if (!aiClassroomModule) {
      aiClassroomModule = mod as AiClassroomModule;
      aiClassroomModule.initAiClassroom();
    }
  }

  async function ensureBattleModule(loader: TabActivateContext['loader']): Promise<void> {
    const { mod } = await loader.load('battle', () =>
      import('../../chemistry/battle/index.js'),
    );
    if (!battleModule) {
      battleModule = mod as BattleModule;
      battleModule.initElementBattle();
    }
  }

  const classroom = createTabbedClassroom({
    subjectId: 'chemistry',
    panels: {
      get table() {
        return panelEl('table');
      },
      get molecule() {
        return panelEl('molecule');
      },
      get molar() {
        return panelEl('molar');
      },
      get electron() {
        return panelEl('electron');
      },
      get battle() {
        return panelEl('battle');
      },
      get ai() {
        return panelEl('ai');
      },
    },
    defaultPageOptions: getDefaultPageOptions('chemistry'),
    defaultTabId: getDefaultTabId('chemistry'),

    boot() {
      ensureChemistryPanelsMounted();
      initPeriodicTable();
      initMolarUI();
    },

    deactivateTab(tabId: string): void {
      // 与对局里「← 大厅」一致：离开乱斗 Tab 即清局、停 AI、停 BGM
      if (tabId === 'battle' && battleModule) {
        battleModule.setScreen('hub');
      }
      if (tabId !== 'molecule' && molModule) {
        molModule.getMolViewer()?.stop();
      }
      if (tabId !== 'electron' && electronViewer) {
        electronViewer.stop();
      }
    },

    async activateTab(tabId: string, ctx: TabActivateContext): Promise<void> {
      const loader = ctx.loader;

      if (tabId === 'table') {
        scheduleFit();
      }

      if (tabId === 'molecule') {
        const ok = await ctx.runFeatureLoad('molecule', () => ensureMoleculeModules(loader));
        if (!ok || ctx.isStale()) return;
        // runFeatureLoad 成功 ⇒ ensureMoleculeModules 已置 molModule
        const mol = molModule!;
        mol.ensureMolViewer();
        await mol.ensureDefaultMolecule();
        if (ctx.isStale()) return;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (ctx.isStale()) return;
            const viewer = mol.getMolViewer();
            if (viewer) {
              viewer.start();
              viewer.resize();
            }
          });
        });
      }

      if (tabId === 'molar') {
        refreshMolarPresets().catch(console.warn);
      }

      if (tabId === 'electron') {
        const ok = await ctx.runFeatureLoad('electron', () => ensureElectronModules(loader));
        if (!ok || ctx.isStale()) return;
        ensureElectronViewerAndLoad(ctx.mySeq, ctx.switchSeq);
      }

      if (tabId === 'ai') {
        await ctx.runFeatureLoad('ai', () => ensureClassroomModule(loader));
      }

      if (tabId === 'battle') {
        await ctx.runFeatureLoad('battle', () => ensureBattleModule(loader));
      }
    },

    onEnterTab(tabId: string): void {
      if (tabId === 'table' || tabId === 'molar') {
        runMolar();
      }
    },

    onResize(): void {
      if (resizePending) return;
      resizePending = true;
      requestAnimationFrame(() => {
        resizePending = false;
        scheduleFit();
        const moleculePanel = panelEl('molecule');
        const electronPanel = panelEl('electron');
        if (molModule && moleculePanel && !moleculePanel.hidden) {
          molModule.getMolViewer()?.resize?.();
        }
        if (electronViewer && electronPanel && !electronPanel.hidden) {
          electronViewer.resize();
        }
      });
    },

    onSideDrawerToggle(key: string, collapsed: boolean): void {
      if (collapsed && key === 'molecule' && molModule) molModule.setMolEditMode(false);
      if (collapsed && key === 'electron' && elecListModule) {
        elecListModule.setElectronEditMode(false);
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const tablePanel = panelEl('table');
          const moleculePanel = panelEl('molecule');
          const electronPanel = panelEl('electron');
          if (key === 'table' && tablePanel && !tablePanel.hidden) scheduleFit();
          if (key === 'molecule' && moleculePanel && !moleculePanel.hidden && molModule) {
            molModule.getMolViewer()?.resize?.();
          }
          if (key === 'electron' && electronPanel && !electronPanel.hidden && electronViewer) {
            electronViewer.resize();
          }
        });
      });
    },
  });

  return {
    ...classroom,
    async enter(ctx: ClassroomEnterContext): Promise<void> {
      ensureChemistryPanelsMounted();
      showChemistryLabHosts();
      return classroom.enter(ctx);
    },
    leave(): void {
      classroom.leave();
      hideChemistryLabHosts();
    },
    onAppRevealed(): void {
      scheduleFit();
    },
  };
}
