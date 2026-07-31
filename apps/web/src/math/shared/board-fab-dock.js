/**
 * 画板右下角 FAB 共用槽：笔记 / 图例设置等水平对齐
 * @param {HTMLElement | null | undefined} host
 * @returns {HTMLElement | null}
 */
export function ensureMathBoardFabDock(host) {
  if (!host) return null;
  let dock = /** @type {HTMLElement | null} */ (
    host.querySelector(':scope > .math-board-fab-dock')
  );
  if (dock) return dock;
  try {
    if (getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }
  } catch {
    /* */
  }
  dock = document.createElement('div');
  dock.className = 'math-board-fab-dock';
  dock.setAttribute('data-math-fab-dock', '1');
  host.appendChild(dock);
  return dock;
}

/**
 * 若 dock 已空则移除
 * @param {HTMLElement | null | undefined} dock
 */
export function pruneMathBoardFabDock(dock) {
  if (!dock) return;
  if (dock.childElementCount === 0) {
    try {
      dock.remove();
    } catch {
      /* */
    }
  }
}
