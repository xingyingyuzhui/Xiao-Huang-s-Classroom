/**
 * 多 Tab 学科教室公共壳：面板切换、按需加载占位、过期序号保护
 */

import { createFeatureLoader } from '../../app/feature-loader.js';
import { getSubjectCapabilities } from '@xiaohuang/subject-settings';
import {
  showPanelLoading as showLoadingOn,
  hidePanelLoading as hideLoadingOn,
  showPanelError as showErrorOn,
} from '../../app/panel-loading.js';

/**
 * @typedef {{ id: string, label: string }} DefaultPageOption
 *
 * @typedef {{
 *   mySeq: number,
 *   switchSeq: number,
 *   isStale: () => boolean,
 *   runFeatureLoad: (panelKey: string, ensureReady: () => Promise<void>) => Promise<boolean>,
 *   loader: ReturnType<typeof createFeatureLoader>,
 * }} TabActivateContext
 *
 * @typedef {{
 *   subjectId: string,
 *   panels: Record<string, Element | null | undefined>,
 *   defaultPageOptions: DefaultPageOption[],
 *   defaultTabId: string,
 *   showTabBar?: boolean,
 *   boot?: () => void | Promise<void>,
 *   activateTab?: (tabId: string, ctx: TabActivateContext) => Promise<void>,
 *   deactivateTab?: (tabId: string, nextTabId: string | null) => void,
 *   onEnterTab?: (tabId: string) => void,
 *   onResize?: () => void,
 *   onSideDrawerToggle?: (key: string, collapsed: boolean) => void,
 *   loader?: ReturnType<typeof createFeatureLoader>,
 * }} TabbedClassroomConfig
 */

/**
 * @param {TabbedClassroomConfig} config
 */
export function createTabbedClassroom(config) {
  const {
    subjectId,
    panels,
    defaultPageOptions,
    defaultTabId,
    showTabBar = true,
    boot,
    activateTab,
    deactivateTab,
    onEnterTab,
    onResize = () => {},
    onSideDrawerToggle = () => {},
    loader = createFeatureLoader(),
  } = config;

  let switchSeq = 0;
  let activeTabId = null;
  const panelKeys = Object.keys(panels);

  function showPanelLoading(name) {
    showLoadingOn(panels[name]);
  }

  function hidePanelLoading(name) {
    hideLoadingOn(panels[name]);
  }

  function showPanelError(name, message) {
    showErrorOn(panels[name], message);
  }

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

  function syncTabButtons(activeId) {
    document.querySelectorAll(`.tab[data-classroom="${subjectId}"]`).forEach((tab) => {
      const on = tab.dataset.tab === activeId;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function syncPanelVisibility(activeId) {
    Object.entries(panels).forEach(([key, el]) => {
      if (!el) return;
      const on = key === activeId;
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
  }

  async function switchTab(name) {
    const mySeq = ++switchSeq;
    const prevTab = activeTabId;

    if (prevTab && prevTab !== name) {
      deactivateTab?.(prevTab, name);
    }

    syncTabButtons(name);
    syncPanelVisibility(name);
    activeTabId = name;

    if (activateTab) {
      await activateTab(name, {
        mySeq,
        switchSeq,
        isStale: () => mySeq !== switchSeq,
        runFeatureLoad: (panelKey, ensureReady) =>
          runFeatureLoad(panelKey, mySeq, ensureReady),
        loader,
      });
    }
  }

  function hidePanels() {
    if (activeTabId) {
      deactivateTab?.(activeTabId, null);
      activeTabId = null;
    }
    Object.values(panels).forEach((el) => {
      if (!el) return;
      el.hidden = true;
      el.classList.remove('active');
    });
    document.querySelectorAll(`.tab[data-classroom="${subjectId}"]`).forEach((tab) => {
      tab.classList.remove('active');
      tab.setAttribute('aria-selected', 'false');
    });
  }

  function resolveDefaultTabId(requested) {
    if (requested && defaultPageOptions.some((o) => o.id === requested)) {
      return requested;
    }
    if (defaultPageOptions.some((o) => o.id === defaultTabId)) {
      return defaultTabId;
    }
    return defaultPageOptions[0]?.id ?? defaultTabId;
  }

  const capabilities = getSubjectCapabilities(subjectId);

  return {
    subjectId,
    showTabBar,
    panelKeys,
    defaultPageOptions,
    defaultTabId,
    capabilities,

    boot() {
      return boot?.();
    },

    async enter({ isStale, getDefaultPage }) {
      hidePanels();
      let tabId = defaultTabId;
      if (getDefaultPage) {
        tabId = resolveDefaultTabId(await getDefaultPage(subjectId));
      }
      if (isStale()) return;
      await switchTab(tabId);
      if (isStale()) return;
      onEnterTab?.(tabId);
    },

    leave() {
      hidePanels();
    },

    hidePanels,

    switchTab,

    onResize,

    onSideDrawerToggle,
  };
}
