/**
 * 舞台浮层读数卡：收起 / 展开（对标分子 info 卡）
 * 在 lab-math-root 上委托绑定一次即可
 */

export function ensureMathFloatCardsBound() {
  const host = document.getElementById('lab-math-root');
  if (!host || host.dataset.floatCardsBound) return;
  host.dataset.floatCardsBound = '1';
  host.addEventListener('click', (ev) => {
    const btn = /** @type {HTMLElement | null} */ (
      /** @type {HTMLElement} */ (ev.target).closest?.('[data-math-card-toggle]')
    );
    if (!btn || !host.contains(btn)) return;
    const card = btn.closest('.math-float-card');
    if (!card) return;
    const collapsed = card.dataset.collapsed === 'true';
    const next = !collapsed;
    card.dataset.collapsed = next ? 'true' : 'false';
    btn.textContent = next ? '+' : '−';
    btn.setAttribute('aria-expanded', next ? 'false' : 'true');
    btn.title = next ? '展开' : '收起';
  });
}
