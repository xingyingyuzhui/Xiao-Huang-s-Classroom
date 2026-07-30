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

  const [attr, rawValue] = markerAttr.split('=');
  const value = rawValue?.replace(/"/g, '') ?? '';
  if (!attr || !value) return false;
  if (host.getAttribute(attr) === value) return true;

  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  host.setAttribute(attr, value);
  host.appendChild(tpl.content);
  return true;
}

/**
 * @param {string} selector
 */
export function unhidePanelHost(selector) {
  const el = document.querySelector(selector);
  if (el) el.hidden = false;
}
