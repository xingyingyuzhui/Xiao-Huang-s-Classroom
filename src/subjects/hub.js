/**
 * 学科大厅：全屏选科
 */

import { SUBJECTS, getSubject } from './catalog.js';

/**
 * @param {object} opts
 * @param {(sel: string) => Element | null} opts.select
 * @param {(id: string) => void} opts.onEnterSubject
 */
export function createSubjectHub({ select, onEnterSubject }) {
  const $ = select;
  const root = $('#subjectHub');
  const grid = $('#subjectHubGrid');

  function render() {
    if (!grid) return;
    grid.innerHTML = SUBJECTS.map((s) => {
      const ready = s.status === 'ready';
      return `
        <button
          type="button"
          class="subject-card${ready ? ' is-ready' : ' is-soon'}"
          data-subject="${s.id}"
          ${ready ? '' : 'disabled'}
          aria-disabled="${ready ? 'false' : 'true'}"
        >
          <span class="subject-card-name">${escapeHtml(s.name)}</span>
          <span class="subject-card-desc">${escapeHtml(s.desc)}</span>
          <span class="subject-card-badge">${ready ? '进入' : '即将推出'}</span>
        </button>`;
    }).join('');

    grid.querySelectorAll('[data-subject]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-subject');
        const meta = getSubject(id);
        if (!meta || meta.status !== 'ready') return;
        onEnterSubject(id);
      });
    });
  }

  function show() {
    if (root) {
      root.hidden = false;
      root.setAttribute('aria-hidden', 'false');
    }
    document.documentElement.dataset.shell = 'hub';
  }

  function hide() {
    if (root) {
      root.hidden = true;
      root.setAttribute('aria-hidden', 'true');
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  render();

  return { show, hide, render };
}
