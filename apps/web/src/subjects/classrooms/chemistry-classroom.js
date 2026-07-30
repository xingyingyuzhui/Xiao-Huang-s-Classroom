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

let panelsMounted = false;

function ensureChemistryPanelsMounted() {
  if (panelsMounted) return;
  const chromeHost = document.getElementById('lab-chemistry-chrome');
  const panelsHost = document.getElementById('lab-panels-root');
  mountPartialHtml(chromeHost, modalsHtml, 'data-mounted=chemistry-modals');
  mountPartialHtml(panelsHost, panelsHtml, 'data-mounted=chemistry-panels');
  unhidePanelHost('#lab-chemistry-chrome');
  unhidePanelHost('#lab-panels-root');
  panelsMounted = true;
}

/**
 * @param {{ select: (sel: string) => Element | null }} deps
 */
export function createChemistryClassroom({ select }) {
  const $ = select;

  const panels = {
    table: () => $('#panel-table'),
    molecule: () => $('#panel-molecule'),
    molar: () => $('#panel-molar'),
    electron: () => $('#panel-electron'),
    battle: () => $('#panel-battle'),
    ai: () => $('#panel-ai'),
  };

  let molModule = null;
  let molAIModule = null;
  let molRxnModule = null;
  let elecListModule = null;
  let elecRendererModule = null;
  let aiClassroomModule = null;
  let battleModule = null;
  let electronViewer = null;
  let resizePending = false;

  function panelEl(key) {
    return panels[key]?.() ?? null;
  }

  async function ensureMoleculeModules(loader) {
    const { mod } = await loader.load('molecule', () =>
      import('../../chemistry/molecule/index.js'),
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

  async function ensureElectronModules(loader) {
    const { mod } = await loader.load('electron', () =>
      Promise.all([
        import('../../chemistry/electron/list.js'),
        import('../../chemistry/electron/renderer.js'),
      ]).then(([list, renderer]) => ({ list, renderer })),
    );
    if (!elecListModule) {
      elecListModule = mod.list;
      elecRendererModule = mod.renderer;
      await elecListModule.initElectronList();
    }
  }

  function ensureElectronViewerAndLoad(mySeq, switchSeq) {
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

  async function ensureClassroomModule(loader) {
    const { mod } = await loader.load('classroom', () =>
      import('../../chemistry/ai-classroom/entry.js'),
    );
    if (!aiClassroomModule) {
      aiClassroomModule = mod;
      aiClassroomModule.initAiClassroom();
    }
  }

  async function ensureBattleModule(loader) {
    const { mod } = await loader.load('battle', () =>
      import('../../chemistry/battle/index.js'),
    );
    if (!battleModule) {
      battleModule = mod;
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

    deactivateTab(tabId) {
      if (tabId !== 'molecule' && molModule) {
        molModule.getMolViewer()?.stop();
      }
      if (tabId !== 'electron' && electronViewer) {
        electronViewer.stop();
      }
    },

    async activateTab(tabId, ctx) {
      const loader = ctx.loader;

      if (tabId === 'table') {
        scheduleFit();
      }

      if (tabId === 'molecule') {
        const ok = await ctx.runFeatureLoad('molecule', () => ensureMoleculeModules(loader));
        if (!ok || ctx.isStale()) return;
        molModule.ensureMolViewer();
        await molModule.ensureDefaultMolecule();
        if (ctx.isStale()) return;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (ctx.isStale()) return;
            const viewer = molModule.getMolViewer();
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

    onEnterTab(tabId) {
      if (tabId === 'table' || tabId === 'molar') {
        runMolar();
      }
    },

    onResize() {
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

    onSideDrawerToggle(key, collapsed) {
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
    onAppRevealed() {
      scheduleFit();
    },
  };
}
