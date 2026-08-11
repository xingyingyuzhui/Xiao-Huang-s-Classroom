/**
 * GraphToolController：工具 tap/pick 状态机与可取消 transient 状态。
 *
 * controller 只维护 transient selection（toolPick / toolOneShot）；
 * 正式对象一律通过 Store action / commit 桥创建。激活工具、tap 分发、
 * 取消与 dispose 全部显式化。
 */

import { handlePerpAxisTap } from './tool-perp.js';

/**
 * @param {{
 *   getState: () => any,
 *   makeDrawHost: () => any,
 *   findUserRec: (el: any) => any | null,
 *   ensureUserPointFromHit: (el: any, usrX: number, usrY: number) => any,
 *   resolveCurveFromTap: (hit: any, usrX: number, usrY: number) => any,
 *   nearestFnAt: (usrX: number, usrY: number) => any,
 *   createUserPoint: (x: number, y: number, opts?: any) => any,
 *   removeUserPointById: (id: string) => void,
 *   commitPointDocument: (record: any) => void,
 *   commitConstructionDocument: (record: any) => void,
 *   removeConstructionById: (id: string) => void,
 *   setUserPointFollowTarget: (el: any, targetId: string) => Promise<void>,
 *   reregisterSelectable: () => void,
 *   evalFnY: (fn: any, x: number) => number | null,
 * }} context
 */
export function createGraphToolController(context) {
  const { getState } = context;

  function clearToolPick() {
    const state = getState();
    state.toolPick = null;
    const tool = state.toolStrip?.getTool?.() || 'select';
    const def = context.getBoardToolDef?.(tool);
    state.toolStrip?.setHint?.(tool === 'select' ? '' : def?.hint || '');
  }

  function finishOneShotToolIfDone() {
    const state = getState();
    if (!state.toolOneShot) return;
    if (state.toolPick) return;
    state.toolOneShot = false;
    state.toolStrip?.setTool?.('select');
  }

  async function handleToolTap(ctx) {
    const state = getState();
    if (!state.board || state.notes?.isActive?.()) return;
    const tool = state.toolStrip?.getTool?.() || 'select';
    if (tool === 'select') return;
    try {
      await handleToolTapBody(ctx, tool);
    } finally {
      finishOneShotToolIfDone();
    }
  }

  async function handleToolTapBody(ctx, tool) {
    const host = context.makeDrawHost();
    const { usrX, usrY, hit } = ctx;
    const state = getState();

    if (tool === 'point') {
      await addPointAt(usrX, usrY);
      return;
    }
    if (tool === 'delete') {
      if (hit?._mathUserPoint) {
        const rec = context.findUserRec(hit);
        if (rec && !rec.locked) {
          state.styleBind?.selection?.clear?.();
          context.removeUserPointById(rec.id);
        }
        return;
      }
      if (hit?._mathConstrId) {
        state.styleBind?.selection?.clear?.();
        context.removeConstructionById(hit._mathConstrId);
        return;
      }
      if (hit?._mathFnId || state.functions.some((f) => f.curve === hit)) {
        const fn =
          (hit._mathFnId && state.functions.find((f) => f.id === hit._mathFnId)) ||
          state.functions.find((f) => f.curve === hit);
        if (fn && !fn.locked) context.deleteFn?.(fn.id);
        return;
      }
      // hit 未命中时：按像素容差扫用户点（小点难精确点中）
      for (const rec of state.userPoints || []) {
        if (rec.locked || !rec.el) continue;
        try {
          const dx = Number(rec.el.X()) - usrX;
          const dy = Number(rec.el.Y()) - usrY;
          const unit = Math.abs(Number(state.board?.unitX) || 40);
          if (Math.hypot(dx, dy) * unit < 16) {
            state.styleBind?.selection?.clear?.();
            context.removeUserPointById(rec.id);
            return;
          }
        } catch {
          /* invalid point */
        }
      }
      state.toolStrip?.setHint?.('请点中要删除的点或线');
      return;
    }
    if (tool === 'probe') {
      state.probe?.activate?.();
      return;
    }
    if (tool === 'segment' || tool === 'line') {
      let rec = context.findUserRec(hit);
      if (!rec && (hit?.elType === 'point' || hit?.elType === 'glider')) {
        rec = context.ensureUserPointFromHit(hit, usrX, usrY);
      }
      if (!rec && hit?._mathFeatureMark) {
        rec = context.ensureUserPointFromHit(hit, usrX, usrY);
      }
      if (!rec && context.isCurveEl?.(hit)) {
        rec = context.ensureUserPointFromHit(hit, usrX, usrY);
      }
      if (!rec) {
        const near = context.nearestFnAt(usrX, usrY);
        if (near?.fn) {
          const followId =
            context.followIdForFn?.(near.fn.id) || context.curveFollowTargetId?.(near.fn.id);
          rec = context.createUserPoint(usrX, near.y ?? usrY, {
            followTargetId: followId,
            showCoords: true,
          });
        } else {
          rec = context.createUserPoint(usrX, usrY, { showCoords: true });
        }
        context.reregisterSelectable();
      }
      if (!rec) {
        state.toolStrip?.setHint?.('请点选或落一个点');
        return;
      }
      if (!state.toolPick || state.toolPick.tool !== tool) {
        state.toolPick = { tool, pointId: rec.id };
        state.toolStrip?.setHint?.(`已选 ${rec.baseName || rec.id}，再点第二个点`);
        return;
      }
      if (state.toolPick.pointId === rec.id) {
        state.toolStrip?.setHint?.('请选择不同的第二个点');
        return;
      }
      const p1 = host.findUserEl(state.toolPick.pointId);
      const p2 = rec.el;
      if (p1 && p2) {
        context.commitConstructionDocument(
          context.createSegmentOrLine(host, tool, p1, p2, [state.toolPick.pointId, rec.id]),
        );
      }
      clearToolPick();
      return;
    }

    if (tool === 'tangent') {
      let anchorEl = context.findUserRec(hit)?.el || null;
      let fn = null;
      if (anchorEl) {
        const resolved = context.resolveTangentAnchor?.(anchorEl, host);
        if (resolved) {
          fn = resolved.fn;
          anchorEl = resolved.pt;
        }
      }
      if (!fn) fn = context.resolveCurveFromTap(hit, usrX, usrY);
      if (!fn) {
        state.toolStrip?.setHint?.('请点在曲线附近');
        return;
      }
      const followTargetId = context.pickTangentFollowTargetId?.(fn, usrX, usrY, context.followTol?.());
      if (!anchorEl) {
        const y = context.evalFnY(fn, usrX);
        const up = context.createUserPoint(usrX, y == null ? usrY : y, {
          followTargetId,
          showCoords: true,
        });
        anchorEl = up?.el;
        context.reregisterSelectable();
      } else {
        const rec = context.findUserRec(anchorEl);
        if (rec && followTargetId && rec.followTargetId !== followTargetId) {
          const parsed = context.parseFeatureFollowTargetId?.(followTargetId);
          if (parsed) {
            void context.setUserPointFollowTarget(anchorEl, followTargetId);
          }
        }
      }
      const pid = context.userPointIdOf?.(anchorEl);
      if (!anchorEl || !pid) {
        state.toolStrip?.setHint?.('无法在此处创建切点');
        return;
      }
      context.commitConstructionDocument(
        context.createTangent(host, anchorEl, fn, pid),
      );
      clearToolPick();
      return;
    }

    if (tool === 'perp-axis') {
      handlePerpAxisTap(context, host, ctx, state, { clearToolPick });
      return;
    }

    if (tool === 'intersect') {
      await handleIntersectTap(host, ctx);
      return;
    }

    if (tool === 'secant') {
      await handleSecantTap(host, ctx);
      return;
    }

    state.toolStrip?.setHint?.(`工具 ${tool} 暂不可用`);
  }

  async function handleSecantTap(host, ctx) {
    const state = getState();
    const { usrX, usrY, hit } = ctx;
    const fnHit = context.resolveCurveFromTap(hit, usrX, usrY);
    const pick = state.toolPick;

    if (!pick || pick.tool !== 'secant') {
      if (!fnHit) {
        state.toolStrip?.setHint?.('请点在曲线附近选择函数');
        return;
      }
      state.toolPick = { tool: 'secant', fnId: fnHit.id, x1: usrX };
      state.toolStrip?.setHint?.(`已选「${context.fnDisplayLabel(fnHit)}」，再点一个 x 作为 B 点`);
      return;
    }

    if (!fnHit || fnHit.id !== pick.fnId) {
      state.toolStrip?.setHint?.('请在同一曲线上选择第二个 x');
      return;
    }
    const rec = context.createSecantConstruction(host, {
      kind: 'secant',
      fnId: pick.fnId,
      x1: pick.x1,
      x2: usrX,
      showDelta: true,
    });
    if (rec) {
      context.commitConstructionDocument(rec);
      for (const el of rec.els || []) {
        const which = el._mathSecantX;
        if (!which) continue;
        if (typeof el.on !== 'function') continue;
        el.on('up', () => {
          if (!state.graphStore) return;
          const ax = Number(rec.els.find((e) => e._mathSecantX === 'x1')?.X?.() ?? rec.x1);
          const bx = Number(rec.els.find((e) => e._mathSecantX === 'x2')?.X?.() ?? rec.x2);
          state.graphStore.dispatch({
            type: 'construction/update',
            payload: { id: rec.id, patch: { x1: ax, x2: bx } },
          });
        });
      }
    }
    clearToolPick();
  }

  async function handleIntersectTap(host, ctx) {
    const state = getState();
    const { usrX, usrY, hit } = ctx;
    const pick = state.toolPick;
    const fnHit = context.resolveCurveFromTap(hit, usrX, usrY);
    const lineHit = context.isLineLike(hit) ? hit : null;

    if (!pick || pick.tool !== 'intersect') {
      if (fnHit) {
        state.toolPick = { tool: 'intersect', kind: 'curve', fnId: fnHit.id };
        state.toolStrip?.setHint?.(`已选「${context.fnDisplayLabel(fnHit)}」，再点另一条曲线`);
        return;
      }
      if (lineHit && hit._mathConstrId) {
        state.toolPick = { tool: 'intersect', kind: 'line', constrId: hit._mathConstrId, el: hit };
        state.toolStrip?.setHint?.('已选直线，再选另一条直线');
        return;
      }
      state.toolStrip?.setHint?.('请点在曲线附近');
      return;
    }

    if (pick.kind === 'curve') {
      if (!fnHit) {
        state.toolStrip?.setHint?.('请再点另一条曲线');
        return;
      }
      if (fnHit.id === pick.fnId) {
        state.toolStrip?.setHint?.('请选择另一条不同的曲线');
        return;
      }
      const made = context.createFnIntersection(host, pick.fnId, fnHit.id);
      if (!made) {
        void context.appAlert?.('这两条曲线在定义域附近暂无交点', { title: '交点' });
      }
      clearToolPick();
      context.reregisterSelectable();
      return;
    }

    if (pick.kind === 'line' && lineHit && hit._mathConstrId) {
      if (hit._mathConstrId === pick.constrId) {
        state.toolStrip?.setHint?.('请选择另一条直线');
        return;
      }
      context.commitConstructionDocument(
        context.createLineIntersection(host, pick.el, hit, [pick.constrId, hit._mathConstrId]),
      );
      clearToolPick();
      return;
    }
    state.toolStrip?.setHint?.('请继续点选第二条对象');
  }

  async function addPointAt(usrX, usrY) {
    const state = getState();
    if (!state.board) return;
    let x = usrX;
    let y = usrY;
    /** @type {string | null} */
    let followTargetId = null;
    /** @type {[string, string] | null} */
    let intersectFnIds = null;
    // 1) 优先：靠近两函数交点 → 询问是否成为交点
    const ix = context.findFunctionIntersectionNear(state.functions, x, y, context.followTol?.());
    if (ix) {
      const okIx = await context.appConfirm(
        `该位置靠近「${context.fnDisplayLabel(ix.fnA)}」与「${context.fnDisplayLabel(ix.fnB)}」的交点，是否成为交点？`,
        { title: '函数交点', okText: '成为交点', cancelText: '否' },
      );
      if (okIx) {
        intersectFnIds = [ix.fnA.id, ix.fnB.id];
        x = ix.x;
        y = ix.y;
        context.createUserPoint(x, y, { intersectFnIds, showCoords: true });
        context.reregisterSelectable();
        state.board.update();
        return;
      }
    }
    // 2) 否则：靠近单条曲线 → 询问是否跟随
    const hit = context.hitFollowNear(x, y);
    if (hit) {
      const ok = await context.appConfirm(`该位置靠近「${hit.target.label || '曲线'}」，是否让点跟随？`, {
        title: '跟随对象',
        okText: '跟随',
        cancelText: '自由点',
      });
      if (ok) {
        followTargetId = hit.target.id;
        const sn = hit.target.snap(x, y);
        if (sn) {
          x = sn.x;
          y = sn.y;
        }
      }
    }
    context.createUserPoint(x, y, { followTargetId, showCoords: true });
    context.reregisterSelectable();
    state.board.update();
  }

  return {
    handleToolTap,
    addPointAt,
    clearToolPick,
    finishOneShotToolIfDone,
    cancel() {
      clearToolPick();
      const state = getState();
      state.toolOneShot = false;
    },
    getState: () => ({
      toolPick: getState().toolPick,
      toolOneShot: getState().toolOneShot,
    }),
    dispose() {
      this.cancel();
    },
  };
}
