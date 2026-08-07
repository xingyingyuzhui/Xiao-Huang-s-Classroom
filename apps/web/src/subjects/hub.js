/**
 * 学科大厅：3D 书场选科（各学科可进教室壳）
 */

import { subjectManifests, getSubjectMeta } from './manifest.js';
import { createBookshelfStage } from './bookshelf/stage.js';

/**
 * @param {object} opts
 * @param {(sel: string) => Element | null} opts.select
 * @param {(id: string) => void} opts.onEnterSubject
 * @param {() => void} [opts.onRevealHub]
 */
export function createSubjectHub({ select, onEnterSubject, onRevealHub }) {
  const $ = select;
  const root = $('#subjectHub');
  /** @type {ReturnType<typeof createBookshelfStage> | null} */
  let stage = null;
  let entering = false;
  /** @type {(() => void) | null} */
  let revealHubHandler = onRevealHub || null;

  function mountStage() {
    if (stage || !root) return;
    const canvas = /** @type {HTMLCanvasElement | null} */ ($('#bookshelfGl'));
    const closeBtn = $('#bookshelfClose');
    const detail = $('#bookshelfDetail');
    const enterBtn = $('#bookshelfEnter');
    const lockNote = $('#bookshelfLock');
    const pageFxRoot = $('#bookshelfPageFx');
    if (!canvas || !closeBtn || !detail) {
      console.warn('subject hub bookshelf DOM missing');
      return;
    }

    try {
      stage = createBookshelfStage({
        canvas,
        closeBtn: /** @type {HTMLElement} */ (closeBtn),
        detail: /** @type {HTMLElement} */ (detail),
        enterBtn: /** @type {HTMLElement | null} */ (enterBtn),
        lockNote: /** @type {HTMLElement | null} */ (lockNote),
        pageFxRoot: /** @type {HTMLElement | null} */ (pageFxRoot),
        subjects: subjectManifests(),
        onEnterSubject: (id) => {
          if (entering) return;
          const meta = getSubjectMeta(id);
          if (!meta || meta.status !== 'ready') return;
          entering = true;
          onEnterSubject(id);
          queueMicrotask(() => {
            entering = false;
          });
        },
        onRevealHub: () => {
          if (root) {
            root.hidden = false;
            root.setAttribute('aria-hidden', 'false');
          }
          document.documentElement.dataset.shell = 'hub';
          revealHubHandler?.();
          requestAnimationFrame(() => {
            stage?.relayout();
            stage?.syncTheme?.();
          });
        },
      });
    } catch (err) {
      console.error('createBookshelfStage failed', err);
      stage = null;
    }
  }

  function show() {
    if (root) {
      root.hidden = false;
      root.setAttribute('aria-hidden', 'false');
    }
    document.documentElement.dataset.shell = 'hub';
    document.body.classList.remove(
      'transit',
      'detail-open',
      'bookshelf-entering',
      'bookshelf-dive-deep',
    );
    mountStage();
    stage?.show();
    requestAnimationFrame(() => {
      stage?.relayout();
      stage?.syncTheme?.();
    });
  }

  /**
   * 从教室回到大厅：帷幕不透明 → 切回大厅壳（幕下）→ 凝聚合书归架
   * @param {object} [opts]
   * @param {string} [opts.subjectId]
   * @param {() => void} [opts.onDone]
   */
  function playReturnFromLab(opts = {}) {
    mountStage();
    const meta = getSubject(opts.subjectId || 'chemistry');
    /* 帷幕 onOpaque 后再 onRevealHub；大厅画布在幕下预热 */
    if (root) {
      root.hidden = false;
      /* 仍由 CSS lab+bookshelf-entering 控制为 opacity:0，待 reveal 后可见 */
    }
    stage?.playReturnFromLab({
      subjectId: meta?.id || 'chemistry',
      subjectName: meta?.name || '化学',
      onDone: opts.onDone,
    });
  }

  function hide() {
    stage?.hide();
    if (root) {
      root.hidden = true;
      root.setAttribute('aria-hidden', 'true');
    }
  }

  /**
   * @param {() => void} fn
   */
  function setRevealHubHandler(fn) {
    revealHubHandler = fn;
  }

  return { show, hide, playReturnFromLab, setRevealHubHandler, render: () => {} };
}
