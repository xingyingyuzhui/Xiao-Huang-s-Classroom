/**
 * 非化学学科：仅首页占位教室（无 Tab / 无功能模块）
 */

import { getSubject } from '../catalog.js';

/**
 * @param {object} opts
 * @param {(sel: string) => Element | null} opts.select
 */
export function createHomeClassroom({ select }) {
  const $ = select;
  const panel = $('#panel-subject-home');
  const titleEl = $('[data-subject-home-title]');
  const enEl = $('[data-subject-home-en]');
  const descEl = $('[data-subject-home-desc]');
  const modulesEl = $('[data-subject-home-modules]');

  function show(subjectId) {
    const meta = getSubject(subjectId);
    if (!panel || !meta) return;

    if (titleEl) titleEl.textContent = `${meta.name}教室`;
    if (enEl) enEl.textContent = meta.en || '';
    if (descEl) {
      descEl.textContent =
        meta.classroomIntro ||
        '教室首页已开放，互动模块正在筹备中。可以先熟悉学科方向，内容会陆续上线。';
    }
    if (modulesEl) {
      modulesEl.textContent = (meta.modules || []).join(' · ') || '筹备中';
    }

    panel.hidden = false;
    panel.classList.remove('active');
    void panel.offsetWidth;
    panel.classList.add('active');
  }

  function hide() {
    if (!panel) return;
    panel.hidden = true;
    panel.classList.remove('active');
  }

  return { show, hide };
}
