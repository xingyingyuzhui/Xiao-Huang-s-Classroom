/**
 * 应用壳：学科大厅 ↔ 各学科教室编排
 */

import '../shared/styles/index.css';
import { initSettingsUI, SETTINGS_CONTEXT } from '../shared/ui/settings.js';
import { initBrandTip } from '../shared/ui/brand-tip.js';
import { initSideDrawers } from '../shared/ui/side-drawer.js';
import { createSubjectHub } from '../subjects/hub.js';
import { bindSubjectChrome } from '../subjects/chrome.js';
import { getCurrentSubjectId, setCurrentSubjectId } from '../subjects/session.js';
import { getSubjectMeta as getSubject } from '../subjects/manifest.js';
import {
  createClassroomRegistry,
  syncClassroomTabChrome,
} from '../subjects/classrooms/registry.js';
import { loadRuntimeConfig, isFeatureEnabled } from '../shared/runtime-config.js';

const $ = (sel) => document.querySelector(sel);

async function revealApp(classroomRegistry) {
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
  await classroomRegistry.onAppRevealed();
}

/** 初始化应用（大厅 + 实验室壳） */
export async function initApp() {
  const classroomRegistry = createClassroomRegistry({ select: $ });
  await classroomRegistry.boot();

  initBrandTip();

  /** @type {import('../subjects/classrooms/types.js').SubjectClassroom | null} */
  let activeClassroom = null;

  /** @type {'hub' | 'lab' | 'entering' | 'returning'} */
  let shellMode = 'hub';
  let subjectChrome;
  let labEnterSeq = 0;

  function setLabSubjectDataset(subjectId) {
    if (subjectId) {
      document.documentElement.dataset.labSubject = subjectId;
    } else {
      delete document.documentElement.dataset.labSubject;
    }
  }

  function hideAllLabPanels() {
    classroomRegistry.all().forEach((c) => c.hidePanels());
    syncClassroomTabChrome(null);
  }

  await loadRuntimeConfig();
  /** @type {Awaited<ReturnType<typeof import('../account/boot-account-cloud.js').bootAccountCloud>>} */
  let accountCloud = null;
  if (isFeatureEnabled('accountCloudProgram')) {
    const { bootAccountCloud } = await import('../account/boot-account-cloud.js');
    accountCloud = await bootAccountCloud();
  }

  const settingsApi = await initSettingsUI({
    getDefaultPageOptions: (subjectId) => classroomRegistry.getDefaultPageOptions(subjectId),
    getClassroomCapabilities: (subjectId) =>
      classroomRegistry.getClassroomCapabilities(subjectId),
    resolveDefaultPage: (subjectId, stored) =>
      classroomRegistry.resolveDefaultPage(subjectId, stored),
    onDefaultPageChange: () => {},
    accountCloud,
  });

  accountCloud?.refreshSettingsSection?.();

  function syncSettingsContext() {
    if (shellMode === 'hub' || shellMode === 'returning') {
      settingsApi.setContext({ mode: SETTINGS_CONTEXT.hub });
      settingsApi.applyHubBrand();
    } else if (activeClassroom) {
      settingsApi.setContext({
        mode: SETTINGS_CONTEXT.lab,
        subjectId: activeClassroom.subjectId,
      });
      settingsApi.applySubjectBrand(activeClassroom.subjectId);
    }
  }

  initSideDrawers({
    onToggle: (key, collapsed) => {
      activeClassroom?.onSideDrawerToggle(key, collapsed);
    },
  });

  const subjectHub = createSubjectHub({
    select: $,
    onEnterSubject: (id) => enterSubject(id),
  });

  subjectHub.setRevealHubHandler(() => {
    shellMode = 'returning';
    void accountCloud?.deactivateSubject?.();
    setCurrentSubjectId(null);
    setLabSubjectDataset(null);
    activeClassroom?.leave();
    activeClassroom = null;
    hideAllLabPanels();
    subjectChrome.sync('hub', null);
    syncSettingsContext();
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

  function showHub() {
    labEnterSeq += 1;
    shellMode = 'hub';
    void accountCloud?.deactivateSubject?.();
    setCurrentSubjectId(null);
    setLabSubjectDataset(null);
    activeClassroom?.leave();
    activeClassroom = null;
    hideAllLabPanels();
    subjectHub.show();
    subjectChrome.sync('hub', null);
    syncSettingsContext();
  }

  function returnToHubAnimated() {
    if (shellMode === 'returning') return;
    const id = getCurrentSubjectId() || 'chemistry';
    labEnterSeq += 1;
    shellMode = 'returning';
    void accountCloud?.deactivateSubject?.();
    subjectHub.playReturnFromLab({
      subjectId: id,
      onDone: () => {
        shellMode = 'hub';
        setCurrentSubjectId(null);
        setLabSubjectDataset(null);
        activeClassroom?.leave();
        activeClassroom = null;
        hideAllLabPanels();
        document.documentElement.dataset.shell = 'hub';
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
        syncSettingsContext();
      },
    });
  }

  async function enterSubject(id) {
    const meta = getSubject(id);
    if (!meta || meta.status !== 'ready') return;
    const classroom = classroomRegistry.get(id);
    if (!classroom) return;
    if (shellMode === 'returning') return;

    const seq = ++labEnterSeq;
    shellMode = 'entering';
    setCurrentSubjectId(id);

    if (accountCloud) {
      const workspaceResult = await accountCloud.activateSubject(id);
      if (!workspaceResult.ok && seq === labEnterSeq) {
        accountCloud.statusStore?.update({
          phase: 'failed',
          lastError: '云端工作区切换失败，同步可能不可用',
        });
      }
    }

    if (activeClassroom && activeClassroom !== classroom) {
      activeClassroom.leave();
    }

    subjectHub.hide();
    document.documentElement.dataset.shell = 'lab';
    setLabSubjectDataset(id);
    subjectChrome.sync('lab', id);
    syncClassroomTabChrome(classroom);
    syncSettingsContext();

    try {
      await classroom.enter({
        isStale: () => seq !== labEnterSeq,
        getDefaultPage: (subjectId) => settingsApi.getDefaultPage(subjectId),
      });

      if (seq !== labEnterSeq) return;
      activeClassroom = classroom;
      shellMode = 'lab';
      syncSettingsContext();
    } catch (err) {
      console.error('enterSubject failed', err);
      if (seq === labEnterSeq) {
        activeClassroom = classroom;
        shellMode = 'lab';
      }
    }
  }

  document.querySelectorAll('.tab[data-classroom]').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (shellMode !== 'lab' || !activeClassroom) return;
      if (tab.dataset.classroom !== activeClassroom.subjectId) return;
      const tabId = tab.dataset.tab;
      if (!tabId) return;
      activeClassroom.switchTab(tabId);
    });
  });

  window.addEventListener('resize', () => {
    activeClassroom?.onResize();
  });

  showHub();

  await revealApp(classroomRegistry);
}
