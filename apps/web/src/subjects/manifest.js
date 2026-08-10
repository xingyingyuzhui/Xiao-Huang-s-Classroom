/**
 * Subject manifest adapter（Program 4 Task 4.4-4.6）。
 *
 * 把现有 catalog.js（SUBJECTS）+ subject-settings（tab 元数据）包装为
 * @xiaohuang/subject-kit 的 SubjectManifest 协议；不改 feature 内部行为。
 * 物理/生物 placeholder 走 status: 'locked'（可见不可点，沿用现有行为）。
 */
import { getDefaultTabId, getSubjectTabMeta } from '@xiaohuang/subject-settings';
import { getClassroomFactory } from './classroom-loader.js';
import { SUBJECTS } from './catalog.js';

/** 已注册 classroom 工厂 id（纯数据；与 registry.CLASSROOM_FACTORY_IDS 一致，
 *  结构测试锁定；避免动态 import registry 连带 DOM/HTML 加载） */
const CLASSROOM_FACTORY_IDS = Object.freeze(['chemistry', 'physics', 'biology', 'math']);

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
    // 视觉透传（hub 3D 书场渲染需要；单一数据源仍是 catalog）
    name: meta.name,
    en: meta.en,
    desc: meta.desc,
    blurb: meta.blurb,
    modules: meta.modules,
    book: meta.book,
    // 教室首页文案透传（home-shell 消费；单一数据源仍是 catalog）
    classroomIntro: meta.classroomIntro,
    classroom: {
      id: subjectId,
      defaultPanel: getDefaultTabId(subjectId),
      panels,
      mount: async () => {
        // classroom-loader 零依赖（无 registry/HTML/DOM 依赖），由 registry.js
        // 装配时静态注册工厂；本模块静态导入工厂查询函数，仍禁止静态导入
        // classrooms/registry.js（其依赖 DOM/HTML partial，Node 测试不可静态
        // 加载，且避免 home-shell → manifest → registry 依赖环）。
        const factory = getClassroomFactory(subjectId);
        if (!factory) throw new Error(`未注册 classroom 工厂: ${subjectId}`);
        return factory({ select: (sel) => document.querySelector(sel) });
      },
      /** 工厂注册检查（纯数据，不触发 DOM/HTML 加载） */
      hasFactory: async () => CLASSROOM_FACTORY_IDS.includes(subjectId),
    },
  };
}

/** 全部 manifest（按 catalog 顺序）。 */
export function subjectManifests() {
  return SUBJECTS.map((s) => subjectManifest(s.id)).filter(Boolean);
}

/**
 * 兼容入口（R4.1）：hub/chrome/shell 统一从 manifest 取学科元数据。
 * 只转发 manifest 数据，不维护第二份状态。
 * @param {string} subjectId
 */
export function getSubjectMeta(subjectId) {
  return subjectManifest(subjectId);
}
