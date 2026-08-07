/**
 * Subject manifest adapter（Program 4 Task 4.4-4.6）。
 *
 * 把现有 catalog.js（SUBJECTS）+ subject-settings（tab 元数据）包装为
 * @xiaohuang/subject-kit 的 SubjectManifest 协议；不改 feature 内部行为。
 * 物理/生物 placeholder 走 status: 'locked'（可见不可点，沿用现有行为）。
 */
import { getDefaultTabId, getSubjectTabMeta } from '@xiaohuang/subject-settings';
import { SUBJECTS } from './catalog.js';

/** 可进入 manifest 的学科（化学/数学）；物理/生物为 locked placeholder */
const READY_MANIFEST_IDS = new Set(['chemistry', 'math']);

/**
 * @param {string} subjectId
 * @returns {import('@xiaohuang/subject-kit').SubjectManifest | null}
 */
export function subjectManifest(subjectId) {
  const meta = SUBJECTS.find((s) => s.id === subjectId);
  if (!meta) return null;
  const tabMeta = getSubjectTabMeta(subjectId);

  const panels = (tabMeta?.tabs ?? []).map((t) => ({
    id: t.id,
    label: t.label,
    load: () => Promise.resolve(t),
  }));

  return {
    id: subjectId,
    status: READY_MANIFEST_IDS.has(subjectId) ? 'ready' : 'locked',
    intro: {
      title: meta.name,
      description: meta.desc,
      ctaLabel: '进入课堂',
    },
    cover: {
      variants: ['v1', 'v2', 'v3', 'v4', 'v5'],
    },
    classroom: {
      id: subjectId,
      defaultPanel: getDefaultTabId(subjectId),
      panels,
      mount: async () => {
        // 延迟导入 registry（其工厂依赖 DOM/HTML partial，Node 测试不可静态加载）
        const { CLASSROOM_FACTORIES } = await import('./classrooms/registry.js');
        const factory = CLASSROOM_FACTORIES[subjectId];
        if (!factory) throw new Error(`未注册 classroom 工厂: ${subjectId}`);
        return factory({ select: (sel) => document.querySelector(sel) });
      },
    },
  };
}

/** 全部 manifest（按 catalog 顺序）。 */
export function subjectManifests() {
  return SUBJECTS.map((s) => subjectManifest(s.id)).filter(Boolean);
}
