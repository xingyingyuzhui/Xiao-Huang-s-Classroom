/**
 * 学科教室注册表：按 catalog 工厂注册，壳层不硬编码分支
 */

import {
  getDefaultPageOptions,
  getDefaultTabId,
  isValidDefaultPage,
  READY_SUBJECT_IDS,
} from '@xiaohuang/subject-settings';
import { createChemistryClassroom } from './chemistry-classroom.js';
import { createPhysicsClassroom } from './physics-classroom.js';
import { createBiologyClassroom } from './biology-classroom.js';
import { createMathClassroom } from './math-classroom.js';

/** @type {Record<string, (deps: { select: (sel: string) => Element | null }) => import('./types.js').SubjectClassroom>} */
const CLASSROOM_FACTORIES = {
  chemistry: createChemistryClassroom,
  physics: createPhysicsClassroom,
  biology: createBiologyClassroom,
  math: createMathClassroom,
};

/**
 * @param {{ select: (sel: string) => Element | null }} deps
 */
export function createClassroomRegistry(deps) {
  /** @type {Map<string, import('./types.js').SubjectClassroom>} */
  const byId = new Map();

  for (const subjectId of READY_SUBJECT_IDS) {
    const factory = CLASSROOM_FACTORIES[subjectId];
    if (!factory) continue;
    byId.set(subjectId, factory(deps));
  }

  return {
    get(subjectId) {
      return byId.get(subjectId) ?? null;
    },

    all() {
      return [...byId.values()];
    },

    async boot() {
      for (const classroom of byId.values()) {
        await classroom.boot?.();
      }
    },

    async onAppRevealed() {
      for (const classroom of byId.values()) {
        await classroom.onAppRevealed?.();
      }
    },

    getDefaultPageOptions(subjectId) {
      return getDefaultPageOptions(subjectId);
    },

    getClassroomCapabilities(subjectId) {
      const classroom = byId.get(subjectId);
      return classroom?.capabilities ?? { brand: false, defaultPage: false, ai: false };
    },

    resolveDefaultPage(subjectId, storedPageId) {
      if (storedPageId && isValidDefaultPage(subjectId, storedPageId)) {
        return storedPageId;
      }
      return getDefaultTabId(subjectId);
    },
  };
}

/**
 * 同步顶栏 Tab：仅显示当前学科的 Tab 按钮
 * @param {import('./types.js').SubjectClassroom | null} classroom
 */
export function syncClassroomTabChrome(classroom) {
  const nav = document.querySelector('.tabs');
  if (nav) nav.hidden = !classroom?.showTabBar;

  document.querySelectorAll('.tab[data-classroom]').forEach((tab) => {
    const owner = tab.dataset.classroom;
    tab.hidden = !classroom || owner !== classroom.subjectId;
  });
}
