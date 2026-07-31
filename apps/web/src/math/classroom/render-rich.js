/**
 * 讲解正文：转义 HTML + 简单段落 + $LaTeX$
 */

import { texHtml } from '../shared/tex.js';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 将含 $...$ / $$...$$ 的纯文本渲染为安全 HTML
 * @param {string} raw
 */
export function renderRichMathText(raw) {
  const text = String(raw || '').trim();
  if (!text) return '<p class="math-empty">暂无内容</p>';

  const blocks = text.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const line = block.trim();
      if (!line) return '';
      const withTex = line.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (_, display, inline) => {
        const src = (display ?? inline ?? '').trim();
        if (!src) return '';
        return texHtml(src, Boolean(display));
      });
      // 已由 katex 注入的 span 保持；其余 escape 过的段落用 <br>
      const parts = withTex.split(/(<span class="katex[\s\S]*?<\/span>)/g);
      const safe = parts
        .map((p) => {
          if (p.startsWith('<span class="katex')) return p;
          return escapeHtml(p).replace(/\n/g, '<br />');
        })
        .join('');
      return `<p class="math-lesson-p">${safe}</p>`;
    })
    .join('');
}

export { escapeHtml };
