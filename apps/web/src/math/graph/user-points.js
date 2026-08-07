/** 函数画布用户点的创建、快照、跟随切换和销毁。 */

import {
  BOARD_LABEL_FONT_SIZE,
  applyBoardLabel,
  bindLiveLabel,
  boardLabelAttrs,
  formatElementCoordsLabel,
  writeElementLabel,
} from '../shared/board-label.js';
import { bindPointIntegerSnap } from '../shared/board-snap.js';
import {
  curveFollowTargetId,
  parseFeatureFollowTargetId,
} from '../shared/follow-target.js';
import { applyObjectStyle, readObjectStyle } from '../shared/object-style.js';
import {
  pointConstraintFromLegacy,
  pointStyleFromLegacy,
} from './graph-document.js';
import {
  clearAllConstructions,
  deleteConstructionsDependingOnPoint,
  restoreConstructions,
  snapshotConstructions,
} from './draw-tools.js';

/**
 * @typedef {{
 *   id: string,
 *   el: any,
 *   followTargetId: string | null,
 *   intersectFnIds: [string, string] | null,
 *   showCoords: boolean,
 *   baseName: string,
 * }} UserPointRec
 */

/** @param {any} element @param {string} [baseName] */
function formatPointLabel(element, baseName) {
  const resolvedName = element?._mathBaseName || baseName || 'P';
  return formatElementCoordsLabel(element, resolvedName);
}

/** @param {any} element */
function refreshPointLabelText(element) {
  if (!element) return;
  if (typeof element._mathLiveLabelTick === 'function') {
    element._mathLiveLabelTick();
    return;
  }
  writeElementLabel(element, formatPointLabel(element));
}

/** @param {any} element @param {string} baseName @param {boolean} showCoords */
function applyPointLabel(element, baseName, showCoords) {
  if (!element) return;
  element._mathBaseName = baseName;
  element._mathShowCoords = showCoords;
  applyBoardLabel(element, {
    baseName,
    text: () => formatPointLabel(element, baseName),
    fontSize: BOARD_LABEL_FONT_SIZE,
    offset: [14, 14],
  });
  bindLiveLabel(element, () => formatPointLabel(element));
}

/**
 * @param {{
 *   getBoard: () => any,
 *   getRecords: () => UserPointRec[],
 *   setRecords: (records: UserPointRec[]) => void,
 *   nextId: () => string,
 *   getColors: () => any,
 *   resolveFollowTarget: (x: number, y: number, preferredId?: string | null, options?: { requireNear?: boolean }) => any,
 *   recomputeIntersection: (firstId: string, secondId: string, x: number, y: number) => { x: number, y: number } | null,
 *   listSnapTargets: (excludeElement?: any) => Array<{ x: number, y: number, el?: any }>,
 *   makeDrawHost: () => any,
 *   onSelectableChanged: () => void,
 *   getSelection: () => any,
 *   getViewportCenter: () => { x: number, y: number },
 *   defaultFollowTargetId: string,
 *   onPointMoved?: (record: UserPointRec, x: number, y: number) => void,
 * }} context
 */
export function createUserPointController(context) {
  const find = (element) =>
    context.getRecords().find((record) => record.el === element) || null;

  /**
   * @param {number} x
   * @param {number} y
   * @param {{
   *   followTargetId?: string | null,
   *   follow?: boolean,
   *   intersectFnIds?: [string, string] | null,
   *   showCoords?: boolean,
   *   id?: string,
   *   baseName?: string,
   *   style?: any,
   * }} [options]
   */
  function create(x, y, options = {}) {
    const board = context.getBoard();
    if (!board) return null;
    const colors = context.getColors();
    const id = options.id || context.nextId();
    const baseName = options.baseName || id;
    const showCoords = options.showCoords !== false;
    const intersectFnIds =
      options.intersectFnIds?.length === 2
        ? /** @type {[string, string]} */ ([options.intersectFnIds[0], options.intersectFnIds[1]])
        : null;

    if (intersectFnIds) {
      const hit = context.recomputeIntersection(
        intersectFnIds[0],
        intersectFnIds[1],
        x,
        y,
      );
      if (hit) {
        x = hit.x;
        y = hit.y;
      }
    }

    let followTargetId = null;
    if (!intersectFnIds) {
      followTargetId =
        options.followTargetId != null
          ? options.followTargetId
          : options.follow
            ? context.defaultFollowTargetId
            : null;
    }

    let target = null;
    if (followTargetId) {
      target = context.resolveFollowTarget(x, y, followTargetId, { requireNear: false });
      if (!target) {
        followTargetId = null;
      } else {
        followTargetId = target.id;
        const snapped = target.snap(x, y);
        if (snapped) {
          x = snapped.x;
          y = snapped.y;
        }
      }
    }

    const attrs = {
      name: baseName,
      size: 5,
      fillColor: colors.stamp,
      strokeColor: colors.pointRing,
      withLabel: true,
      label: boardLabelAttrs({
        strokeColor: colors.ink,
        color: colors.ink,
      }),
    };
    const useGlider =
      Boolean(followTargetId) &&
      target &&
      target.el &&
      target.kind !== 'feature';
    const element = useGlider
      ? board.create('glider', [x, y, target.el], attrs)
      : board.create('point', [x, y], { ...attrs, fixed: Boolean(intersectFnIds) });

    Object.assign(element, {
      _mathUserPoint: true,
      _mathCanFollow: !intersectFnIds,
      _mathFollow: Boolean(followTargetId),
      _mathFollowTargetId: followTargetId,
      _mathIntersectFnIds: intersectFnIds,
      _mathPointId: id,
    });
    applyPointLabel(element, baseName, showCoords);
    bindPointIntegerSnap(element, context.getBoard, {
      onSnapped: () => refreshPointLabelText(element),
      getTargets: () => context.listSnapTargets(element),
    });
    if (typeof element.on === 'function') {
      element.on('up', () => {
        void relaxFeatureFollow(element);
        try {
          context.onPointMoved?.(record, Number(element.X()), Number(element.Y()));
        } catch {
          /* a disposed board must not break drag commit */
        }
      });
    }
    if (options.style) {
      applyObjectStyle(element, {
        strokeColor: options.style.strokeColor,
        strokeWidth: options.style.strokeWidth,
        fillColor: options.style.fillColor,
        fillOpacity: options.style.fillOpacity,
        size: options.style.size,
        fontSize: options.style.fontSize,
      });
    }

    const record = {
      id,
      el: element,
      followTargetId,
      intersectFnIds,
      showCoords,
      baseName,
    };
    context.getRecords().push(record);
    return record;
  }

  function snapshot() {
    return context.getRecords().map((record) => {
      let x = 0;
      let y = 0;
      try {
        x = Number(record.el.X());
        y = Number(record.el.Y());
      } catch {
        /* a partially disposed point keeps its last safe coordinates */
      }
      return {
        id: record.id,
        followTargetId: record.followTargetId || null,
        intersectFnIds: record.intersectFnIds ? [...record.intersectFnIds] : null,
        showCoords: record.showCoords,
        baseName: record.baseName,
        x,
        y,
        style: readObjectStyle(record.el, record.baseName),
      };
    });
  }

  /**
   * 单条 runtime 记录 → 文档点记录（工具创建后同步进 store 用）。
   * @param {any} record
   */
  function documentRecordOf(record) {
    if (!record) return null;
    let x = 0;
    let y = 0;
    try {
      x = Number(record.el.X());
      y = Number(record.el.Y());
    } catch {
      /* partially disposed point keeps its last safe coordinates */
    }
    return {
      id: record.id,
      name: record.baseName,
      x,
      y,
      constraint: pointConstraintFromLegacy(record.followTargetId, record.intersectFnIds, { x }),
      showCoords: record.showCoords,
      locked: false,
      style: pointStyleFromLegacy(readObjectStyle(record.el, record.baseName)),
    };
  }

  /**
   * 文档格式快照：legacy 运行时字段 → GraphDocument 点记录（含 constraint/style）。
   */
  function snapshotDocument() {
    return context.getRecords().map(documentRecordOf);
  }

  /**
   * 从文档点记录创建 runtime 点（constraint → follow/intersection 语义）。
   * @param {any} pointRecord
   */
  function createFromDocument(pointRecord) {
    if (!pointRecord || typeof pointRecord !== 'object') return null;
    const constraint = pointRecord.constraint || { kind: 'free' };
    let followTargetId = null;
    let intersectFnIds = null;
    let x = Number.isFinite(Number(pointRecord.x)) ? Number(pointRecord.x) : 0;
    let y = Number.isFinite(Number(pointRecord.y)) ? Number(pointRecord.y) : 0;
    if (constraint.kind === 'followFunction') {
      followTargetId = curveFollowTargetId(constraint.functionId);
      x = Number.isFinite(Number(constraint.anchorX)) ? Number(constraint.anchorX) : x;
    } else if (constraint.kind === 'followFeature') {
      followTargetId = `graph:fn:${constraint.functionId}:feature:${constraint.feature}`;
    } else if (constraint.kind === 'intersection') {
      intersectFnIds = /** @type {[string, string]} */ ([
        constraint.targetIds[0],
        constraint.targetIds[1],
      ]);
      x = Number.isFinite(Number(constraint.nearX)) ? Number(constraint.nearX) : x;
    }
    return create(x, y, {
      id: pointRecord.id,
      baseName: pointRecord.name || pointRecord.id,
      followTargetId,
      intersectFnIds,
      showCoords: pointRecord.showCoords !== false,
      style: pointRecord.style
        ? {
            strokeColor: pointRecord.style.stroke?.explicitColor || undefined,
            fillColor: pointRecord.style.fill?.explicitColor || undefined,
            fillOpacity: pointRecord.style.fill?.opacity,
            size: pointRecord.style.size,
            fontSize: pointRecord.style.label?.fontSize,
          }
        : undefined,
    });
  }

  function removeAll() {
    const board = context.getBoard();
    if (!board) return;
    for (const record of context.getRecords()) {
      try {
        board.removeObject(record.el);
      } catch {
        /* continue teardown after a partially disposed point */
      }
    }
    context.setRecords([]);
  }

  function restore(saved) {
    for (const item of saved || []) {
      const intersectFnIds =
        item.intersectFnIds?.length === 2
          ? /** @type {[string, string]} */ ([item.intersectFnIds[0], item.intersectFnIds[1]])
          : null;
      const followTargetId = intersectFnIds
        ? null
        : item.followTargetId != null
          ? item.followTargetId
          : item.follow
            ? context.defaultFollowTargetId
            : null;
      create(item.x, item.y, {
        id: item.id,
        followTargetId,
        intersectFnIds,
        showCoords: item.showCoords,
        baseName: item.baseName,
        style: item.style,
      });
    }
  }

  async function setFollow(element, follow) {
    const record = find(element);
    if (!record) return;
    let followTargetId = null;
    if (follow) {
      const x = Number(element.X());
      const y = Number(element.Y());
      const target = context.resolveFollowTarget(
        x,
        y,
        record.followTargetId,
        { requireNear: false },
      );
      if (!target) return;
      followTargetId = target.id;
    }
    await setFollowTarget(element, followTargetId);
  }

  /**
   * @param {any} element
   * @param {string | null} followTargetId
   */
  async function setFollowTarget(element, followTargetId) {
    const record = find(element);
    const board = context.getBoard();
    if (!record || !board) return;
    const nextId = followTargetId || null;
    if ((record.followTargetId || null) === nextId) {
      // 仍绑特征时：拖后若仍近则吸回特征坐标
      if (nextId) {
        const x = Number(element.X());
        const y = Number(element.Y());
        const target = context.resolveFollowTarget(x, y, nextId, { requireNear: false });
        const snapped = target?.snap?.(x, y);
        if (snapped && target?.kind === 'feature') {
          try {
            if (typeof element.setPositionDirectly === 'function') {
              element.setPositionDirectly(1, [snapped.x, snapped.y]);
            } else if (typeof element.moveTo === 'function') {
              element.moveTo([snapped.x, snapped.y], 0);
            }
          } catch {
            /* */
          }
          refreshPointLabelText(element);
          try {
            board.update?.();
          } catch {
            /* */
          }
        }
      }
      return;
    }

    const x = Number(element.X());
    const y = Number(element.Y());
    const style = readObjectStyle(element, record.baseName);
    const { id, baseName, showCoords } = record;
    const previousFollowTargetId = record.followTargetId;
    const drawHost = context.makeDrawHost();
    const savedConstructions = snapshotConstructions(drawHost);
    clearAllConstructions(drawHost);

    try {
      board.removeObject(element);
    } catch {
      /* continue replacement after a partially disposed point */
    }
    context.setRecords(context.getRecords().filter((item) => item.id !== id));

    const replacement = create(x, y, {
      id,
      baseName,
      showCoords,
      followTargetId: nextId,
      style,
    });
    const activePoint = replacement || create(x, y, {
      id,
      baseName,
      showCoords,
      followTargetId: previousFollowTargetId,
      style,
    });
    restoreConstructions(context.makeDrawHost(), savedConstructions, { notify: false });
    context.onSelectableChanged();
    if (activePoint) {
      const viewport = context.getViewportCenter();
      context.getSelection()?.select?.(activePoint.el, {
        label: baseName,
        clientX: viewport.x,
        clientY: viewport.y,
      });
    }
    board.update();
  }

  async function relaxFeatureFollow(element) {
    const record = find(element);
    if (!record?.followTargetId) return;
    const parsed = parseFeatureFollowTargetId(record.followTargetId);
    if (!parsed) return;
    let x = 0;
    let y = 0;
    try {
      x = Number(element.X());
      y = Number(element.Y());
    } catch {
      return;
    }
    const target = context.resolveFollowTarget(x, y, record.followTargetId, {
      requireNear: false,
    });
    const distance = target?.distance?.(x, y);
    const tol =
      typeof context.featureFollowTol === 'function'
        ? context.featureFollowTol()
        : 0.35;
    if (distance != null && Number.isFinite(distance) && distance <= tol) {
      await setFollowTarget(element, record.followTargetId);
      return;
    }
    await setFollowTarget(element, curveFollowTargetId(parsed.fnId));
  }

  function setShowCoords(element, enabled) {
    const record = find(element);
    if (record) {
      record.showCoords = enabled;
      applyPointLabel(record.el, record.baseName, enabled);
    } else {
      element._mathShowCoords = enabled;
      const baseName = element._mathBaseName ||
        (typeof element.name === 'string' ? element.name : '点');
      element._mathBaseName = baseName;
      if (typeof element._mathLiveLabelTick === 'function') {
        element._mathLiveLabelTick();
      } else {
        applyPointLabel(element, baseName, enabled);
      }
    }
    try {
      element.board?.update?.();
    } catch {
      /* ignore a disposed JSXGraph board */
    }
    try {
      element.board?._mathSchedulePointLabelFusion?.();
    } catch {
      /* */
    }
  }

  function remove(element) {
    const record = find(element);
    const board = context.getBoard();
    if (!record || !board) return false;
    try {
      context.getSelection()?.clear?.();
    } catch {
      /* selection may already be disposed */
    }
    deleteConstructionsDependingOnPoint(context.makeDrawHost(), record.id, {
      notify: false,
    });
    try {
      board.removeObject(record.el);
    } catch {
      /* continue state cleanup after a partially disposed point */
    }
    context.setRecords(context.getRecords().filter((item) => item.id !== record.id));
    context.onSelectableChanged();
    try {
      board.update();
    } catch {
      /* ignore a disposed JSXGraph board */
    }
    return true;
  }

  return {
    create,
    createFromDocument,
    delete: remove,
    /** 文档语义样式 → runtime 元素（颜色经 strict hex 校验，未命中时跳过） */
    applyStyle(element, style) {
      if (!element || !style || typeof style !== 'object') return;
      const patch = {};
      const stroke = style.stroke || {};
      const fill = style.fill || {};
      const label = style.label || {};
      if (typeof stroke.explicitColor === 'string') patch.strokeColor = stroke.explicitColor;
      if (typeof fill.explicitColor === 'string') patch.fillColor = fill.explicitColor;
      if (Number.isFinite(Number(stroke.opacity))) patch.strokeOpacity = Number(stroke.opacity);
      if (Number.isFinite(Number(fill.opacity))) patch.fillOpacity = Number(fill.opacity);
      if (Number.isFinite(Number(style.size))) patch.size = Number(style.size);
      if (Number.isFinite(Number(label.fontSize))) patch.fontSize = Number(label.fontSize);
      if (Object.keys(patch).length) {
        try {
          applyObjectStyle(element, patch);
        } catch {
          /* partially disposed element */
        }
      }
    },
    documentRecordOf,
    find,
    removeAll,
    restore,
    setFollow,
    setFollowTarget,
    setShowCoords,
    snapshot,
    snapshotDocument,
  };
}

