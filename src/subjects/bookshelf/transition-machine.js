/**
 * 学科进出场纯状态机（可注入时钟）。
 * 不读写 DOM / Three.js；只发阶段事件并校验 transitionId。
 *
 * 进入：requestEnter → enter-focus → enter-book → enter-page
 *       → (pageOpaque ∧ labReady) → lab-visible → lab-interactive → settled → lab-idle
 * 返回：requestReturn → exiting-cover
 *       → pageOpaque → (hubPrepared) → exiting-book → pageCleared
 *       → hub-visible → hub-interactive → settled → hub-idle
 * 反向：任意非 idle → neutral-cover → reportNeutralCoverOpaque → 新方向首阶段
 */

/** @typedef {'hub-idle'|'lab-idle'|'enter-focus'|'enter-book'|'enter-page'|'lab-visible'|'lab-interactive'|'exiting-cover'|'exiting-book'|'hub-visible'|'hub-interactive'|'neutral-cover'|'failed-cover'|'settled'} TransitionPhase */

/**
 * @typedef {{
 *   setTimeout: (fn: () => void, ms: number) => any,
 *   clearTimeout: (id: any) => void,
 * }} TransitionClock
 */

/**
 * @param {object} [opts]
 * @param {(e: { type: string, id: number, [k: string]: any }) => void} [opts.emit]
 * @param {TransitionClock} [opts.clock]
 * @param {boolean} [opts.reducedMotion]
 * @param {{
 *   enterBookMs?: number,
 *   enterPageMs?: number,
 *   labInteractiveMs?: number,
 *   hubInteractiveMs?: number,
 *   labReadyTimeoutMs?: number,
 * }} [opts.timings]
 */
export function createTransitionMachine({
  emit = () => {},
  clock = { setTimeout, clearTimeout },
  reducedMotion = false,
  timings = {},
} = {}) {
  const enterBookMs = timings.enterBookMs ?? (reducedMotion ? 0 : 160);
  const enterPageMs = timings.enterPageMs ?? (reducedMotion ? 0 : 280);
  const labInteractiveMs = timings.labInteractiveMs ?? (reducedMotion ? 0 : 220);
  const hubInteractiveMs = timings.hubInteractiveMs ?? (reducedMotion ? 0 : 180);
  const labReadyTimeoutMs = timings.labReadyTimeoutMs ?? 8000;

  let id = 0;
  /** @type {TransitionPhase} */
  let phase = 'hub-idle';
  /** @type {string | null} */
  let subjectId = null;
  /** @type {string | null} */
  let direction = null; // 'enter' | 'return' | null
  /** @type {string | null} */
  let pendingDirection = null;
  /** @type {string | null} */
  let pendingSubjectId = null;
  /** @type {string | null} */
  let queuedThemeId = null;
  /** @type {string | null} */
  let committedThemeId = null;

  let pageOpaque = false;
  let labReady = false;
  let hubPrepared = false;
  let pageCleared = false;

  /** @type {any[]} */
  let timers = [];

  function clearTimers() {
    timers.forEach((t) => clock.clearTimeout(t));
    timers = [];
  }

  /**
   * @param {number} forId
   * @param {number} ms
   * @param {() => void} fn
   */
  function schedule(forId, ms, fn) {
    if (ms <= 0) {
      // still async-safe: run on next tick of injected clock if possible
      const t = clock.setTimeout(() => {
        if (forId !== id) return;
        fn();
      }, 0);
      timers.push(t);
      return;
    }
    const t = clock.setTimeout(() => {
      if (forId !== id) return;
      fn();
    }, ms);
    timers.push(t);
  }

  /**
   * @param {TransitionPhase} next
   * @param {Record<string, any>} [payload]
   */
  function begin(next, payload = {}) {
    phase = next;
    emit({ type: next, id, subjectId, ...payload });
  }

  function resetFlags() {
    pageOpaque = false;
    labReady = false;
    hubPrepared = false;
    pageCleared = false;
  }

  function isBusy() {
    return (
      phase !== 'hub-idle' &&
      phase !== 'lab-idle' &&
      phase !== 'failed-cover'
    );
  }

  function flushThemeIfIdle() {
    if (phase !== 'hub-idle' && phase !== 'lab-idle') return;
    if (!queuedThemeId) return;
    const themeId = queuedThemeId;
    queuedThemeId = null;
    committedThemeId = themeId;
    emit({ type: 'theme-commit', id, themeId });
  }

  function settleTo(idlePhase) {
    clearTimers();
    begin('settled', { to: idlePhase });
    phase = idlePhase;
    direction = null;
    pendingDirection = null;
    pendingSubjectId = null;
    resetFlags();
    // re-emit idle for consumers that only listen for idle phases
    emit({ type: idlePhase, id, subjectId });
    flushThemeIfIdle();
  }

  function startEnterTimeline(activeId, sid) {
    subjectId = sid;
    direction = 'enter';
    resetFlags();
    begin('enter-focus', { subjectId: sid });
    schedule(activeId, enterBookMs, () => {
      if (phase !== 'enter-focus') return;
      begin('enter-book', { subjectId: sid });
    });
    schedule(activeId, enterPageMs, () => {
      if (phase !== 'enter-focus' && phase !== 'enter-book') return;
      begin('enter-page', { subjectId: sid });
      schedule(activeId, labReadyTimeoutMs, () => {
        if (id !== activeId) return;
        if (phase !== 'enter-page') return;
        if (labReady) return;
        begin('failed-cover', { reason: 'lab-timeout', subjectId: sid });
        clearTimers();
      });
    });
  }

  function startReturnTimeline(activeId) {
    direction = 'return';
    resetFlags();
    begin('exiting-cover', { subjectId });
  }

  function maybeLabVisible() {
    if (phase !== 'enter-page') return;
    if (!pageOpaque || !labReady) return;
    begin('lab-visible', { subjectId });
    schedule(id, labInteractiveMs, () => {
      if (phase !== 'lab-visible') return;
      begin('lab-interactive', { subjectId });
      settleTo('lab-idle');
    });
  }

  function maybeExitBook() {
    if (phase !== 'exiting-cover') return;
    if (!pageOpaque || !hubPrepared) return;
    begin('exiting-book', { subjectId });
  }

  function maybeHubVisible() {
    if (phase !== 'exiting-book') return;
    if (!pageCleared) return;
    begin('hub-visible', { subjectId });
    schedule(id, hubInteractiveMs, () => {
      if (phase !== 'hub-visible') return;
      begin('hub-interactive', { subjectId });
      settleTo('hub-idle');
    });
  }

  /**
   * 反向请求：先中性遮罩，opaque 后再开新方向。
   * @param {'enter' | 'return'} nextDir
   * @param {string | null} sid
   */
  function reverseViaNeutral(nextDir, sid) {
    clearTimers();
    id += 1;
    pendingDirection = nextDir;
    pendingSubjectId = sid;
    resetFlags();
    begin('neutral-cover', { pendingDirection: nextDir, subjectId: sid });
    return id;
  }

  return {
    /** @returns {number} */
    id: () => id,
    /** @returns {TransitionPhase} */
    phase: () => phase,
    /** @returns {string | null} */
    subject: () => subjectId,
    /** @returns {string | null} */
    committedTheme: () => committedThemeId,
    /** @returns {string | null} */
    queuedTheme: () => queuedThemeId,

    /**
     * @param {string} sid
     * @returns {number | null} transition id, or null if ignored
     */
    requestEnter(sid) {
      if (phase === 'lab-idle' || phase === 'failed-cover') return null;
      if (phase === 'enter-focus' || phase === 'enter-book' || phase === 'enter-page' || phase === 'lab-visible' || phase === 'lab-interactive') {
        return null; // ignore re-enter
      }
      if (phase === 'exiting-cover' || phase === 'exiting-book' || phase === 'hub-visible' || phase === 'hub-interactive' || phase === 'neutral-cover') {
        return reverseViaNeutral('enter', sid);
      }
      // hub-idle
      clearTimers();
      id += 1;
      startEnterTimeline(id, sid);
      return id;
    },

    /**
     * @returns {number | null}
     */
    requestReturn() {
      if (phase === 'hub-idle') return null;
      if (phase === 'exiting-cover' || phase === 'exiting-book' || phase === 'hub-visible' || phase === 'hub-interactive') {
        return null;
      }
      if (phase === 'enter-focus' || phase === 'enter-book' || phase === 'enter-page' || phase === 'lab-visible' || phase === 'lab-interactive' || phase === 'neutral-cover') {
        return reverseViaNeutral('return', subjectId);
      }
      if (phase === 'failed-cover') {
        clearTimers();
        id += 1;
        startReturnTimeline(id);
        return id;
      }
      // lab-idle
      clearTimers();
      id += 1;
      startReturnTimeline(id);
      return id;
    },

    /**
     * @param {string} themeId
     */
    requestTheme(themeId) {
      if (!themeId) return;
      if (phase === 'hub-idle' || phase === 'lab-idle') {
        queuedThemeId = null;
        committedThemeId = themeId;
        emit({ type: 'theme-commit', id, themeId });
        return;
      }
      // busy or failed: keep last request only
      queuedThemeId = themeId;
    },

    /**
     * @param {number} candidate
     */
    reportPageOpaque(candidate) {
      if (candidate !== id) return;
      if (phase === 'enter-page') {
        pageOpaque = true;
        maybeLabVisible();
        return;
      }
      if (phase === 'exiting-cover') {
        pageOpaque = true;
        maybeExitBook();
      }
    },

    /**
     * @param {number} candidate
     */
    reportLabReady(candidate) {
      if (candidate !== id) return;
      if (phase !== 'enter-page') return;
      labReady = true;
      maybeLabVisible();
    },

    /**
     * @param {number} candidate
     */
    reportHubPrepared(candidate) {
      if (candidate !== id) return;
      if (phase !== 'exiting-cover') return;
      hubPrepared = true;
      maybeExitBook();
    },

    /**
     * @param {number} candidate
     */
    reportPageCleared(candidate) {
      if (candidate !== id) return;
      if (phase !== 'exiting-book') return;
      pageCleared = true;
      maybeHubVisible();
    },

    /**
     * @param {number} candidate
     */
    reportNeutralCoverOpaque(candidate) {
      if (candidate !== id) return;
      if (phase !== 'neutral-cover') return;
      const nextDir = pendingDirection;
      const sid = pendingSubjectId;
      pendingDirection = null;
      pendingSubjectId = null;
      if (nextDir === 'enter') {
        startEnterTimeline(id, sid || subjectId || 'chemistry');
      } else {
        startReturnTimeline(id);
      }
    },

    /**
     * @param {number} candidate
     * @param {string} [reason]
     */
    reportFailed(candidate, reason = 'unknown') {
      if (candidate !== id) return;
      if (phase === 'hub-idle' || phase === 'lab-idle' || phase === 'failed-cover') return;
      clearTimers();
      begin('failed-cover', { reason, subjectId });
    },

    /**
     * 外部动画层已清理完毕时调用；在 lab-interactive / hub-interactive 路径下由机内 settle。
     * 允许在 failed-cover 之外的非 idle 阶段强制 settle（测试/兜底）。
     * @param {number} candidate
     * @param {'hub-idle' | 'lab-idle'} [to]
     */
    reportSettled(candidate, to) {
      if (candidate !== id) return;
      if (phase === 'hub-idle' || phase === 'lab-idle') return;
      if (phase === 'failed-cover') return;
      if (phase === 'lab-interactive') {
        settleTo('lab-idle');
        return;
      }
      if (phase === 'hub-interactive') {
        settleTo('hub-idle');
        return;
      }
      if (to === 'lab-idle' || to === 'hub-idle') {
        settleTo(to);
      }
    },
  };
}
