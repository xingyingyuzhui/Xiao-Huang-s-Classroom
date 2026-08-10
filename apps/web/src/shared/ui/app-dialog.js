/**
 * 应用内统一弹窗（替代 window.alert / confirm / prompt）
 * 样式对齐现有 modal-panel，z-index 高于其它业务弹层。
 *
 * P2.4（2026-08-08）：内部改为 @xiaohuang/ui createDialog 承载——由库提供
 * role=dialog / aria-modal / Esc 关闭 / opener 焦点归还 / dispose 生命周期；
 * 标题、正文、按钮、输入区为 createDialog 的轻量组合（组件仅壳层能力，
 * 不覆盖三模式差异）。对外 appAlert / appConfirm / appPrompt 签名不变。
 * 差异说明：每次弹窗新建实例，关闭动画结束后 dispose（原实现复用单 root）。
 * P4.3（2026-08-08）：弹窗打开期间锁定背景滚动（document.body.ui-scroll-lock），
 * 关闭动画结束后按引用计数释放——队列/多弹窗场景计数归零才解锁。
 * U2（2026-08-08）：焦点合同加固——打开聚焦主按钮/prompt 输入框；关闭焦点归还
 * 触发元素；队列链复用首个 opener（连续 confirm 不把焦点丢给已销毁按钮）；
 * Enter 只拦截非按钮区域（焦点在取消/关闭按钮上时回车 = 原生 click，不再误确定）。
 * 2026-08-10：finish 先 focus opener 再 resolve（串行 await 焦点链）；队列空清 chainOpener。
 */
import { createDialog } from '@xiaohuang/ui';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @type {Array<() => void>} */
const queue = [];
let busy = false;
let dialogSeq = 0;

/** 队列链首个触发元素（U2）：链式 confirm 复用，避免捕获到会随前一个弹窗销毁的按钮。 */
let chainOpener = null;

/**
 * 背景滚动锁定（P4.3）：引用计数——队列中多个 dialog 顺序打开时，
 * 前一个关闭（动画结束）不释放锁定，计数归零才移除 body 上的类。
 */
let scrollLockCount = 0;
function lockBodyScroll() {
  scrollLockCount += 1;
  document.body.classList.add('ui-scroll-lock');
}
function unlockBodyScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) document.body.classList.remove('ui-scroll-lock');
}

/**
 * @param {{
 *   mode: 'alert' | 'confirm' | 'prompt',
 *   title?: string,
 *   message: string,
 *   okText?: string,
 *   cancelText?: string,
 *   danger?: boolean,
 *   defaultValue?: string,
 *   placeholder?: string,
 *   inputLabel?: string,
 * }} opts
 * @returns {Promise<boolean | string | null | void>}
 */
function showDialog(opts) {
  return new Promise((resolve) => {
    // 记录触发元素（a11y：关闭后焦点归还）。队列链场景（已有弹窗打开/排队）复用
    // 链首 opener——若逐条记录，后一个弹窗的 opener 会是指向前一个弹窗内部按钮的
    // 引用，该按钮随弹窗销毁后焦点归还落空。
    const hasChain = busy || queue.length > 0;
    const opener = hasChain
      ? chainOpener
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (!hasChain) chainOpener = opener;
    queue.push(() => runDialog(opts, resolve, opener));
    drain();
  });
}

function drain() {
  if (busy) return;
  const next = queue.shift();
  if (!next) {
    // 队列清空后丢掉链首引用，避免长期持有已卸载的触发元素
    chainOpener = null;
    return;
  }
  busy = true;
  next();
}

/**
 * @param {object} opts
 * @param {(v: any) => void} resolve
 * @param {HTMLElement | null} opener
 */
function runDialog(opts, resolve, opener) {
  const seq = ++dialogSeq;
  const mode = opts.mode || 'alert';
  const title =
    opts.title || (mode === 'confirm' ? '请确认' : mode === 'prompt' ? '请输入' : '提示');
  const isPrompt = mode === 'prompt';
  const isConfirm = mode === 'confirm' || isPrompt;

  // 壳层：createDialog（Esc → onClose → onCancel；role/aria/dispose 由库管理）
  const dialog = createDialog({ title: '', open: false, onClose: () => onCancel() });
  const root = dialog.element;
  root.classList.add('app-dialog-root');
  root.id = `appDialogRoot-${seq}`;

  const titleId = `appDialogTitle-${seq}`;
  const msgId = `appDialogMessage-${seq}`;
  const inputId = `appDialogInput-${seq}`;

  // 内容区：结构与既有 _app-dialog.css 保持一致（视觉零回归）
  const backdrop = document.createElement('div');
  backdrop.className = 'app-dialog-backdrop';
  backdrop.setAttribute('data-app-dialog-backdrop', '');
  backdrop.setAttribute('aria-hidden', 'true');

  const panel = document.createElement('div');
  panel.className = 'app-dialog-panel modal-panel';

  const head = document.createElement('div');
  head.className = 'modal-head app-dialog-head';
  const titleEl = document.createElement('h2');
  titleEl.id = titleId;
  titleEl.textContent = title;
  const xBtn = document.createElement('button');
  xBtn.type = 'button';
  xBtn.className = 'settings-close';
  xBtn.setAttribute('data-app-dialog-x', '');
  xBtn.setAttribute('aria-label', '关闭');
  xBtn.textContent = '×';
  head.appendChild(titleEl);
  head.appendChild(xBtn);

  const body = document.createElement('div');
  body.className = 'modal-body app-dialog-body';
  const msgEl = document.createElement('p');
  msgEl.className = 'app-dialog-message';
  msgEl.id = msgId;
  // 先转义再支持简单换行（不可信文案只作 textContent，不注入 HTML）
  msgEl.innerHTML = escapeHtml(opts.message).replace(/\n/g, '<br>');
  body.appendChild(msgEl);

  // 仅 mode=prompt 时显示；确认/提示框绝不出现输入框
  const promptWrap = document.createElement('div');
  promptWrap.className = 'app-dialog-prompt-wrap';
  promptWrap.id = `appDialogPromptWrap-${seq}`;
  promptWrap.hidden = !isPrompt;
  promptWrap.setAttribute('aria-hidden', isPrompt ? 'false' : 'true');
  const field = document.createElement('label');
  field.className = 'app-dialog-prompt-field';
  const labelEl = document.createElement('span');
  labelEl.className = 'app-dialog-prompt-label';
  labelEl.textContent = opts.inputLabel || '内容';
  const inputEl = document.createElement('input');
  inputEl.type = 'text';
  inputEl.className = 'app-dialog-input';
  inputEl.id = inputId;
  inputEl.setAttribute('data-app-dialog-input', '');
  inputEl.autocomplete = 'off';
  if (isPrompt) {
    inputEl.value = opts.defaultValue != null ? String(opts.defaultValue) : '';
    inputEl.placeholder = opts.placeholder || '';
  }
  field.appendChild(labelEl);
  field.appendChild(inputEl);
  promptWrap.appendChild(field);
  body.appendChild(promptWrap);

  const actions = document.createElement('div');
  actions.className = 'settings-actions app-dialog-actions';
  const okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.className = 'btn primary';
  okBtn.setAttribute('data-app-dialog-ok', '');
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn ghost';
  cancelBtn.setAttribute('data-app-dialog-cancel', '');
  cancelBtn.hidden = !isConfirm;
  okBtn.textContent =
    opts.okText || (mode === 'alert' ? '知道了' : mode === 'confirm' ? '确定' : '确定');
  cancelBtn.textContent = opts.cancelText || '取消';
  okBtn.classList.toggle('is-danger', !!opts.danger);
  actions.appendChild(okBtn);
  actions.appendChild(cancelBtn);
  body.appendChild(actions);

  panel.appendChild(head);
  panel.appendChild(body);
  root.appendChild(backdrop);
  root.appendChild(panel);
  document.body.appendChild(root);
  lockBodyScroll();

  let settled = false;
  const finish = (value) => {
    if (settled) return;
    settled = true;
    okBtn.removeEventListener('click', onOk);
    cancelBtn.removeEventListener('click', onCancel);
    xBtn.removeEventListener('click', onCancel);
    backdrop.removeEventListener('click', onCancel);
    document.removeEventListener('keydown', onKey, true);
    root.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    panel.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    // 焦点归还须在 resolve 之前：串行 await appConfirm() 的调用方会立刻开下一个弹窗，
    // 若此时 activeElement 仍是即将 dispose 的确定按钮，下一窗会把错误 opener 记成链首。
    if (opener && document.body.contains(opener)) opener.focus();
    busy = false;
    resolve(value);
    // 等 0.2s 过渡结束后销毁（dispose 幂等）并释放滚动锁定
    setTimeout(() => {
      dialog.dispose();
      unlockBodyScroll();
    }, 220);
    // 下一帧再开下一个，避免同一 click 穿透
    requestAnimationFrame(() => drain());
  };
  const onOk = () => {
    if (isPrompt) finish(String(inputEl?.value ?? ''));
    else if (isConfirm) finish(true);
    else finish();
  };
  const onCancel = () => {
    if (isPrompt) finish(null);
    else if (isConfirm) finish(false);
    else finish();
  };
  const onKey = (e) => {
    if (e.key !== 'Enter') return;
    const target = e.target;
    const tag = target && target.tagName;
    // 焦点在按钮/多行文本上：交给原生行为（Enter 激活聚焦的按钮 → 确定/取消/关闭各归其位）
    if (tag === 'BUTTON' || tag === 'TEXTAREA') return;
    // prompt 输入框回车提交
    if (tag === 'INPUT') {
      if (isPrompt) {
        e.preventDefault();
        onOk();
      }
      return;
    }
    // 其余区域（面板/遮罩/body）回车 = 确定
    if (isPrompt || mode === 'alert' || mode === 'confirm') {
      e.preventDefault();
      onOk();
    }
  };

  okBtn.addEventListener('click', onOk);
  cancelBtn.addEventListener('click', onCancel);
  xBtn.addEventListener('click', onCancel);
  backdrop.addEventListener('click', onCancel);
  document.addEventListener('keydown', onKey, true);

  dialog.update({ open: true });
  // createDialog 无 title 时不写 aria-labelledby——手动关联可见标题（此后不再 update）
  root.setAttribute('aria-labelledby', titleId);
  root.setAttribute('aria-describedby', msgId);
  root.classList.add('is-open');
  root.setAttribute('aria-hidden', 'false');
  backdrop.classList.add('is-open');
  // 强制 reflow 再加 is-open，保证动效
  void panel.offsetWidth;
  panel.classList.add('is-open');

  requestAnimationFrame(() => {
    if (isPrompt) inputEl?.focus();
    else okBtn.focus();
  });
}

/**
 * @param {string} message
 * @param {{ title?: string, okText?: string }} [opts]
 * @returns {Promise<void>}
 */
export function appAlert(message, opts = {}) {
  return showDialog({
    mode: 'alert',
    message: String(message ?? ''),
    title: opts.title,
    okText: opts.okText || '知道了',
  });
}

/**
 * @param {string} message
 * @param {{ title?: string, okText?: string, cancelText?: string, danger?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
export function appConfirm(message, opts = {}) {
  return showDialog({
    mode: 'confirm',
    message: String(message ?? ''),
    title: opts.title || '请确认',
    okText: opts.okText || '确定',
    cancelText: opts.cancelText || '取消',
    danger: !!opts.danger,
  });
}

/**
 * @param {string} message
 * @param {string} [defaultValue]
 * @param {{ title?: string, okText?: string, cancelText?: string, placeholder?: string, inputLabel?: string }} [opts]
 * @returns {Promise<string | null>}
 */
export function appPrompt(message, defaultValue = '', opts = {}) {
  return showDialog({
    mode: 'prompt',
    message: String(message ?? ''),
    title: opts.title || '请输入',
    okText: opts.okText || '确定',
    cancelText: opts.cancelText || '取消',
    defaultValue: defaultValue != null ? String(defaultValue) : '',
    placeholder: opts.placeholder,
    inputLabel: opts.inputLabel,
  });
}
