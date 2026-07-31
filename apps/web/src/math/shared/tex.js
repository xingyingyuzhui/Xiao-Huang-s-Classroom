/**
 * KaTeX 渲染辅助
 */

import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * @param {HTMLElement | null} el
 * @param {string} tex
 * @param {boolean} [displayMode]
 */
export function renderTex(el, tex, displayMode = false) {
  if (!el) return;
  try {
    katex.render(tex, el, {
      throwOnError: false,
      displayMode,
      strict: 'ignore',
    });
  } catch {
    el.textContent = tex;
  }
}

/**
 * @param {string} tex
 * @param {boolean} [displayMode]
 */
export function texHtml(tex, displayMode = false) {
  try {
    return katex.renderToString(tex, {
      throwOnError: false,
      displayMode,
      strict: 'ignore',
    });
  } catch {
    return tex;
  }
}
