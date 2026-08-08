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
import type { ClassroomEnterContext, DefaultPageOption } from './types.js';

export type { DefaultPageOption } from './types.js';

export interface TabActivateContext {
  mySeq: number;
  switchSeq: number;
  isStale: () => boolean;
  runFeatureLoad: (panelKey: string, ensureReady: () => Promise<void>) => Promise<boolean>;
  loader: ReturnType<typeof createFeatureLoader>;
}

export interface TabbedClassroomConfig {
  subjectId: string;
  panels: Record<string, Element | null | undefined>;
  defaultPageOptions: DefaultPageOption[];
  defaultTabId: string;
  showTabBar?: boolean;
  boot?: () => void | Promise<void>;
  activateTab?: (tabId: string, ctx: TabActivateContext) => Promise<void>;
  deactivateTab?: (tabId: string, nextTabId: string | null) => void;
  onEnterTab?: (tabId: string) => void;
  onResize?: () => void;
  onSideDrawerToggle?: (key: string, collapsed: boolean) => void;
  loader?: ReturnType<typeof createFeatureLoader>;
}

/** 错误信息提取：与迁移前 `err?.message || String(err)` 语义一致 */
function messageOf(err: unknown): string {
  const raw = typeof err === 'object' && err !== null && 'message' in err ? err.message : undefined;
  return raw ? String(raw) : String(err);
}

export function createTabbedClassroom(config: TabbedClassroomConfig) {
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
  let activeTabId: string | null = null;
  const panelKeys = Object.keys(panels);

  function showPanelLoading(name: string): void {
    showLoadingOn(panels[name]);
  }

  function hidePanelLoading(name: string): void {
    hideLoadingOn(panels[name]);
  }

  function showPanelError(name: string, message: string): void {
    showErrorOn(panels[name], message);
  }

  async function runFeatureLoad(
    panelName: string,
    mySeq: number,
    ensureReady: () => Promise<void>,
  ): Promise<boolean> {
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
      showPanelError(panelName, messageOf(err));
      return false;
    }
  }

  function syncTabButtons(activeId: string): void {
    document.querySelectorAll<HTMLElement>(`.tab[data-classroom="${subjectId}"]`).forEach((tab) => {
      const on = tab.dataset.tab === activeId;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function syncPanelVisibility(activeId: string): void {
    Object.entries(panels).forEach(([key, el]) => {
      if (!el) return;
      const html = el as HTMLElement;
      const on = key === activeId;
      if (on) {
        html.hidden = false;
        html.classList.remove('active');
        void html.offsetWidth;
        html.classList.add('active');
      } else {
        html.classList.remove('active');
        html.hidden = true;
      }
    });
  }

  async function switchTab(name: string): Promise<void> {
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

  function hidePanels(): void {
    if (activeTabId) {
      deactivateTab?.(activeTabId, null);
      activeTabId = null;
    }
    Object.values(panels).forEach((el) => {
      if (!el) return;
      const html = el as HTMLElement;
      html.hidden = true;
      html.classList.remove('active');
    });
    document.querySelectorAll<HTMLElement>(`.tab[data-classroom="${subjectId}"]`).forEach((tab) => {
      tab.classList.remove('active');
      tab.setAttribute('aria-selected', 'false');
    });
  }

  function resolveDefaultTabId(requested: string | null | undefined): string {
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

    async enter({ isStale, getDefaultPage }: ClassroomEnterContext): Promise<void> {
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
