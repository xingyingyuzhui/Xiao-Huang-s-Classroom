/**
 * 课堂 ↔ 实验台桥：快照 / 施加动作（P1）
 */

/**
 * @typedef {{
 *   tab: string,
 *   label: string,
 *   summary: string,
 *   formula?: string,
 *   params?: Record<string, unknown>,
 * }} LabSnapshot
 *
 * @typedef {{
 *   type: 'openTab' | 'setGraph' | 'setTrig' | 'setSequence' | 'setSolid' | 'setPlane',
 *   tab?: string,
 *   label?: string,
 *   preset?: string,
 *   coeffs?: { a?: number, b?: number, c?: number },
 *   deg?: number,
 *   kind?: 'arith' | 'geom',
 *   a1?: number,
 *   step?: number,
 *   n?: number,
 *   solidType?: 'box' | 'cube' | 'pyramid',
 *   dims?: { a?: number, b?: number, c?: number },
 * }} LabAction
 */

/**
 * @param {{
 *   graph?: any,
 *   plane?: any,
 *   trig?: any,
 *   sequence?: any,
 *   solid?: any,
 *   activeTabId?: string | null,
 * }} mods
 * @returns {LabSnapshot | null}
 */
export function captureLabSnapshot(mods) {
  const tab = mods.activeTabId;
  if (tab === 'graph' && mods.graph?.getLabSnapshot) return mods.graph.getLabSnapshot();
  if (tab === 'plane' && mods.plane?.getLabSnapshot) return mods.plane.getLabSnapshot();
  if (tab === 'trig' && mods.trig?.getLabSnapshot) return mods.trig.getLabSnapshot();
  if (tab === 'sequence' && mods.sequence?.getLabSnapshot) return mods.sequence.getLabSnapshot();
  if (tab === 'solid' && mods.solid?.getLabSnapshot) return mods.solid.getLabSnapshot();
  // 回退：优先有状态的图象台
  if (mods.graph?.getLabSnapshot) {
    const s = mods.graph.getLabSnapshot();
    if (s) return s;
  }
  return null;
}

/**
 * @param {LabAction} action
 * @param {{
 *   graph?: any,
 *   plane?: any,
 *   trig?: any,
 *   sequence?: any,
 *   solid?: any,
 *   switchTab?: (id: string) => void | Promise<void>,
 * }} mods
 */
export async function applyLabAction(action, mods) {
  if (!action || !action.type) return { ok: false, message: '无效动作' };

  if (action.type === 'openTab' && action.tab) {
    await mods.switchTab?.(action.tab);
    return { ok: true, message: `已打开「${action.label || action.tab}」` };
  }

  const tab =
    action.tab ||
    (action.type === 'setGraph'
      ? 'graph'
      : action.type === 'setTrig'
        ? 'trig'
        : action.type === 'setSequence'
          ? 'sequence'
          : action.type === 'setSolid'
            ? 'solid'
            : action.type === 'setPlane'
              ? 'plane'
              : null);

  if (tab) await mods.switchTab?.(tab);

  // 等面板激活 / 模块 init
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  if (action.type === 'setGraph' || (tab === 'graph' && action.coeffs)) {
    if (!mods.graph?.applyLabAction) return { ok: false, message: '函数画布未就绪' };
    return mods.graph.applyLabAction(action);
  }
  if (action.type === 'setTrig' || (tab === 'trig' && action.deg != null)) {
    if (!mods.trig?.applyLabAction) return { ok: false, message: '三角函数未就绪' };
    return mods.trig.applyLabAction(action);
  }
  if (action.type === 'setSequence' || (tab === 'sequence' && (action.a1 != null || action.kind))) {
    if (!mods.sequence?.applyLabAction) return { ok: false, message: '数列未就绪' };
    return mods.sequence.applyLabAction(action);
  }
  if (action.type === 'setSolid' || (tab === 'solid' && action.solidType)) {
    if (!mods.solid?.applyLabAction) return { ok: false, message: '立体几何未就绪' };
    return mods.solid.applyLabAction(action);
  }
  if (action.type === 'setPlane' || tab === 'plane') {
    if (!mods.plane?.applyLabAction) return { ok: false, message: '直线与圆未就绪' };
    return mods.plane.applyLabAction(action);
  }

  return { ok: true, message: '已切换实验台' };
}

/**
 * @param {LabSnapshot | null} snap
 */
export function snapshotToQuizContext(snap) {
  if (!snap) return '';
  const parts = [
    `当前实验台：${snap.label || snap.tab}`,
    snap.summary ? `状态：${snap.summary}` : '',
    snap.formula ? `解析式/公式：${snap.formula}` : '',
  ].filter(Boolean);
  if (snap.params && typeof snap.params === 'object') {
    try {
      parts.push(`参数：${JSON.stringify(snap.params)}`);
    } catch {
      /* */
    }
  }
  return parts.join('\n');
}
