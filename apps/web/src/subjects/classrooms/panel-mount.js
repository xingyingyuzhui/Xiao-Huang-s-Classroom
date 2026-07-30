/**
 * 按学科挂载 HTML partial（Vite ?raw）
 */

/**
 * @param {HTMLElement | null} host
 * @param {string} html
 * @param {string} markerAttr e.g. data-mounted="chemistry-modals"
 */
export function mountPartialHtml(host, html, markerAttr) {
  if (!host || !html) return false;
  if (host.querySelector(`[${markerAttr}]`)) return true;

  const wrap = document.createElement('div');
  const [attr, value] = markerAttr.split('=');
  wrap.setAttribute(attr, value.replace(/"/g, ''));
  wrap.innerHTML = html;
  host.appendChild(wrap);
  return true;
}

/**
 * @param {string} selector
 */
export function unhidePanelHost(selector) {
  const el = document.querySelector(selector);
  if (el) el.hidden = false;
}
