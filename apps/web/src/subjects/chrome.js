/**
 * 顶栏学科标签 + 设置入口「学科大厅」
 */

import { getSubject } from './catalog.js';

/**
 * @param {object} opts
 * @param {(sel: string) => Element | null} opts.select
 * @param {() => void} opts.onBackToHub
 */
export function bindSubjectChrome({ select, onBackToHub }) {
  const $ = select;
  const chip = $('#btnSubjectChip');
  const hubBtn = $('#btnSettingsSubjectHub');

  chip?.addEventListener('click', () => onBackToHub());
  hubBtn?.addEventListener('click', () => onBackToHub());

  /**
   * @param {'hub' | 'lab'} mode
   * @param {string | null} subjectId
   */
  function sync(mode, subjectId) {
    const meta = subjectId ? getSubject(subjectId) : null;
    if (chip) {
      if (mode === 'lab' && meta) {
        chip.hidden = false;
        chip.textContent = meta.name;
        chip.setAttribute('aria-label', `当前学科：${meta.name}，返回学科大厅`);
        chip.title = '返回学科大厅';
      } else {
        chip.hidden = true;
      }
    }
  }

  return { sync };
}
