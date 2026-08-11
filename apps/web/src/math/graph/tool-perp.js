/**
 * 垂线工具（perp-axis）两步分发：先选点，再点轴 / 直线 / 曲线。
 * 从 tool-controller 拆出，避免重构时再把 createPerpToAxis 误当成万能入口。
 */

/**
 * @param {any} context tool-controller 注入的 context
 * @param {any} host makeDrawHost()
 * @param {{ usrX: number, usrY: number, hit: any }} ctx
 * @param {any} state
 * @param {{ clearToolPick: () => void }} ctl
 */
export function handlePerpAxisTap(context, host, ctx, state, ctl) {
  const { usrX, usrY, hit } = ctx;
  const pick = state.toolPick;
  if (!pick || pick.tool !== 'perp-axis') {
    let rec = context.findUserRec(hit);
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
      state.toolStrip?.setHint?.('请先选一点');
      return;
    }
    state.toolPick = { tool: 'perp-axis', pointId: rec.id };
    state.toolStrip?.setHint?.('已选点，再点坐标轴 / 直线 / 曲线');
    return;
  }

  const p1 = host.findUserEl(pick.pointId);
  if (!p1) {
    ctl.clearToolPick();
    return;
  }
  const samePoint = context.findUserRec(hit);
  if (samePoint && samePoint.id === pick.pointId) {
    state.toolStrip?.setHint?.('请选择不同的对象');
    return;
  }

  // 优先：已有直线/线段/切线 → 垂足
  const lineHit = context.isLineLike?.(hit) ? hit : null;
  if (lineHit && hit._mathConstrId) {
    context.commitConstructionDocument(
      context.createPerpToLine(host, p1, lineHit, pick.pointId, hit._mathConstrId),
    );
    ctl.clearToolPick();
    return;
  }

  // 靠近坐标轴（优先于曲线，避免轴附近曲线抢命中）
  const distToX = Math.abs(usrY);
  const distToY = Math.abs(usrX);
  const axisTol = Math.max(0.35, (context.followTol?.() ?? 0.3) * 1.2);
  if (Math.min(distToX, distToY) <= axisTol) {
    const axis = distToX <= distToY ? 'x' : 'y';
    context.commitConstructionDocument(context.createPerpToAxis(host, p1, axis, pick.pointId));
    ctl.clearToolPick();
    return;
  }

  // 曲线：点外→垂足；点已在曲线上→法线（由 createPerpToFn 分流）
  const fnHit = context.resolveCurveFromTap(hit, usrX, usrY);
  if (fnHit) {
    context.commitConstructionDocument(context.createPerpToFn(host, p1, fnHit, pick.pointId));
    ctl.clearToolPick();
    return;
  }

  // 默认：离哪条轴更近垂向哪条
  const axis = distToX <= distToY ? 'x' : 'y';
  context.commitConstructionDocument(context.createPerpToAxis(host, p1, axis, pick.pointId));
  ctl.clearToolPick();
}
