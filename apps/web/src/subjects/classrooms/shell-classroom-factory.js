/**
 * 单首页 / 壳层学科教室：由 tab-catalog 驱动 createTabbedClassroom
 */

import {
  getDefaultPageOptions,
  getDefaultTabId,
  getSubjectTabMeta,
} from '@xiaohuang/subject-settings';
import { createTabbedClassroom } from './tabbed-classroom.js';
import { createHomeClassroom } from './home-shell.js';

/**
 * @param {{
 *   select: (sel: string) => Element | null,
 *   subjectId: string,
 * }} opts
 */
export function createShellSubjectClassroom({ select, subjectId }) {
  const $ = select;
  const tabMeta = getSubjectTabMeta(subjectId);
  if (!tabMeta) {
    throw new Error(`未知学科教室: ${subjectId}`);
  }

  const home = createHomeClassroom({ select });
  /** @type {Record<string, Element | null>} */
  const panels = {};
  for (const tab of tabMeta.tabs) {
    panels[tab.id] = $(`#${tab.panelId}`);
  }

  return createTabbedClassroom({
    subjectId,
    panels,
    defaultPageOptions: getDefaultPageOptions(subjectId),
    defaultTabId: getDefaultTabId(subjectId),
    showTabBar: tabMeta.showTabBar,

    activateTab(tabId) {
      if (tabId === 'home') {
        home.show(subjectId);
      }
    },

    deactivateTab(tabId) {
      if (tabId === 'home') {
        home.hide();
      }
    },
  });
}
