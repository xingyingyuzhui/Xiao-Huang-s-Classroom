/**
 * 滑条 + 数值框双向绑定
 */

/**
 * @param {{
 *   range: HTMLInputElement | null,
 *   number: HTMLInputElement | null,
 *   onChange: (value: number) => void,
 *   allowOutOfRange?: boolean,
 * }} opts
 */
export function bindRangeNumber(opts) {
  const { range, number, onChange, allowOutOfRange = true } = opts;
  if (!range && !number) return;

  const min = range ? Number(range.min) : -Infinity;
  const max = range ? Number(range.max) : Infinity;
  const step = range ? Number(range.step) || 0.1 : 0.1;

  if (number) {
    if (!number.step) number.step = String(step);
    if (range && number.min === '' && Number.isFinite(min)) {
      /* 数值框不强制 min/max，允许更精细输入；滑条仍受范围约束 */
    }
  }

  const apply = (raw, from) => {
    let v = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(v)) return;
    // 滑条拖动：夹在 range 内
    if (from === 'range') {
      v = Math.min(max, Math.max(min, v));
    } else if (!allowOutOfRange && range) {
      v = Math.min(max, Math.max(min, v));
    }
    // 若超出滑条范围，扩展 range 显示用 max/min 临时不改，仅 number 显示真实值
    if (range) {
      if (v < min || v > max) {
        // 显示夹紧到滑条端点，但 onChange 用真实值
        range.value = String(Math.min(max, Math.max(min, v)));
      } else {
        range.value = String(v);
      }
    }
    if (number && document.activeElement !== number) {
      number.value = formatNum(v, step);
    } else if (number && from === 'range') {
      number.value = formatNum(v, step);
    }
    onChange(v);
  };

  range?.addEventListener('input', () => apply(range.value, 'range'));
  // change：失焦 / 气泡「确定」；input：气泡逐键输入时也同步滑条与图象
  number?.addEventListener('change', () => apply(number.value, 'number'));
  number?.addEventListener('input', () => {
    const v = Number(number.value);
    if (!Number.isFinite(v)) return;
    // 输入过程中仅同步滑条位置，完整校验在 change
    if (range) {
      const lo = Number(range.min);
      const hi = Number(range.max);
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        range.value = String(Math.min(hi, Math.max(lo, v)));
      } else {
        range.value = String(v);
      }
    }
    onChange(v);
  });
  number?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      apply(number.value, 'number');
      number.blur();
    }
  });
}

/**
 * 同步 UI 显示（不触发 onChange）
 * @param {HTMLInputElement | null} range
 * @param {HTMLInputElement | null} number
 * @param {number} value
 */
export function syncRangeNumber(range, number, value) {
  if (!Number.isFinite(value)) return;
  if (range) {
    const min = Number(range.min);
    const max = Number(range.max);
    if (Number.isFinite(min) && Number.isFinite(max) && (value < min || value > max)) {
      range.value = String(Math.min(max, Math.max(min, value)));
    } else {
      range.value = String(value);
    }
  }
  if (number && document.activeElement !== number) {
    const step = range ? Number(range.step) || 0.01 : 0.01;
    number.value = formatNum(value, step);
  }
}

/**
 * @param {number} v
 * @param {number} step
 */
function formatNum(v, step) {
  const s = Math.abs(step);
  if (s >= 1) return String(Math.round(v));
  const decimals = Math.min(6, Math.max(0, (String(s).split('.')[1] || '').length));
  const r = Number(v.toFixed(decimals || 2));
  return String(r);
}
