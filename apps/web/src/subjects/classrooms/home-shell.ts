/**
 * 非化学学科：仅首页占位教室（无 Tab / 无功能模块）
 *
 * B4：学科元数据统一经 manifest.js（单一权威入口，关 D13），不直连 catalog。
 */

import { getSubjectMeta } from '../manifest.js';
import type { SubjectManifest } from '@xiaohuang/subject-kit';

/** manifest 透传的首页字段（manifest.js 返回超集，单一数据源仍是 catalog） */
export interface HomeSubjectMeta extends SubjectManifest {
  name: string;
  en?: string;
  modules?: string[];
  classroomIntro?: string;
}

export interface HomeClassroomOptions {
  select: (sel: string) => Element | null;
}

export function createHomeClassroom({ select }: HomeClassroomOptions) {
  const $ = select;
  const panel = $('#panel-subject-home') as HTMLElement | null;
  const titleEl = $('[data-subject-home-title]');
  const enEl = $('[data-subject-home-en]');
  const descEl = $('[data-subject-home-desc]');
  const modulesEl = $('[data-subject-home-modules]');

  function show(subjectId: string): void {
    const meta = getSubjectMeta(subjectId) as HomeSubjectMeta | null;
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

  function hide(): void {
    if (!panel) return;
    panel.hidden = true;
    panel.classList.remove('active');
  }

  return { show, hide };
}
