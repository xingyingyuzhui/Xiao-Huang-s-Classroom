/**
 * 顶栏学科标签 + 设置入口「学科大厅」
 */

import { getSubjectMeta as getSubject } from './manifest.js';
import type { SubjectManifest } from '@xiaohuang/subject-kit';

/** manifest 透传的目录字段（manifest.js 返回超集，单一数据源仍是 catalog） */
export interface SubjectMeta extends SubjectManifest {
  name: string;
}

export interface SubjectChromeOptions {
  select: (sel: string) => Element | null;
  onBackToHub: () => void;
}

export function bindSubjectChrome({ select, onBackToHub }: SubjectChromeOptions) {
  const $ = select;
  const chip = $('#btnSubjectChip') as HTMLElement | null;
  const hubBtn = $('#btnSettingsSubjectHub');

  chip?.addEventListener('click', () => onBackToHub());
  hubBtn?.addEventListener('click', () => onBackToHub());

  function sync(mode: 'hub' | 'lab', subjectId: string | null): void {
    const meta = subjectId ? (getSubject(subjectId) as SubjectMeta | null) : null;
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
