/**
 * 画布 UI 绑定会话（Task 9 拆分）。
 *
 * 职责：文件导入导出/重置按钮、文件选择任务（可取消并 settle）、
 * 下载 URL 资源、ResizeObserver/首帧重排与列表/参数面板刷新绑定。
 * 不持有 GraphDocument 真值；返回 disposer（dispose 精确移除监听、
 * settle 等待中的文件选择、revoke URL、disconnect observer）。
 */
export function createGraphUiBindings(deps) {
  const {
    state,
    getStageEl,
    createGraphPersistenceController,
    createDefaultGraphDocument,
    appConfirm,
    appAlert,
    resizeMathBoard,
    schedulePointLabelFusion,
    ensureMathFloatCardsBound,
    renderFnList,
    syncParamPanel,
    syncSliders,
    bindRangeNumber,
    mountMathNumKeypads,
    setCoeffs,
    bindObjectStyleForPanel,
    createBoardSelectionController,
    register,
  } = deps;

  function bindSlidersAndStyle() {
    const graphPanel = document.getElementById('panel-math-graph');
    if (graphPanel && !graphPanel.dataset.mathSlidersBound) {
      graphPanel.dataset.mathSlidersBound = '1';
      for (const [id, key, numId] of [
        ['mathGraphA', 'a', 'mathGraphANum'],
        ['mathGraphB', 'b', 'mathGraphBNum'],
        ['mathGraphC', 'c', 'mathGraphCNum'],
      ]) {
        bindRangeNumber({
          range: /** @type {HTMLInputElement | null} */ (document.getElementById(id)),
          number: /** @type {HTMLInputElement | null} */ (document.getElementById(numId)),
          onChange: (v) => {
            setCoeffs({ [key]: v });
          },
        });
      }
      mountMathNumKeypads(graphPanel);
    }

    const graphPanelRoot = document.getElementById('panel-math-graph');
    state.styleBind = bindObjectStyleForPanel(graphPanelRoot, createBoardSelectionController);
    state.styleBind?.selection?.attachBoard?.(state.board);
    register(() => state.styleBind?.dispose?.());
  }

  // 项目：导入 / 导出 / 重置（具名 handler + 资源管理；dispose 精确移除）
  /** @type {Array<{ url: string, timer: any }>} */
  const downloadUrls = [];
  let fileChangeHandler = null;
  let fileReader = null;
  let filePickAborted = false;
  /** 文件选择任务的唯一 resolve：保证 dispose/取消时 Promise 一定 settle */
  let settleFilePick = null;
  /** 统一 settle：同一任务只执行一次；清理 change listener/FileReader 后 resolve。 */
  const settleFilePickOnce = (value) => {
    if (!settleFilePick) return;
    const resolve = settleFilePick;
    settleFilePick = null;
    const input = document.getElementById('mathGraphFileInput');
    if (input && fileChangeHandler) input.removeEventListener('change', fileChangeHandler);
    fileChangeHandler = null;
    if (fileReader) {
      try {
        fileReader.abort?.();
      } catch {
        /* best-effort abort */
      }
      fileReader = null;
    }
    resolve(value);
  };

  // sliders 双控与 keypad（dataset 守卫防重复绑定；dispose 保留面板级守卫）
  bindSlidersAndStyle();
  const controller = createGraphPersistenceController({
    persistence: state.graphPersistence,
    store: () => ({
      ...state.graphStore,
      reseedAllocator: (doc) => state.idAllocator?.reseed(doc),
    }),
    history: () => state.graphHistory,
    defaultDocument: () =>
      createDefaultGraphDocument({
        now: () => new Date().toISOString(),
        functionId: 'f1',
      }),
    confirm: appConfirm,
    alert: (message, opts) => appAlert(message, opts),
    pickJsonFile: () => {
      const input = document.getElementById('mathGraphFileInput');
      if (!input || filePickAborted) return Promise.resolve(null);
      // 只允许一个文件选择任务：取消前一个（resolve null + 清理 listener），
      // 避免遗留多个 change listener 或永久 pending 的旧 Promise
      if (settleFilePick) settleFilePickOnce(null);
      return new Promise((resolve) => {
        settleFilePick = resolve;
        const onChange = () => {
          if (fileChangeHandler) input.removeEventListener('change', fileChangeHandler);
          fileChangeHandler = null;
          const file = input.files?.[0];
          input.value = '';
          if (!file || filePickAborted) {
            settleFilePickOnce(null);
            return;
          }
          const reader = new FileReader();
          fileReader = reader;
          reader.onload = () => {
            // 已被 dispose/新任务接管：旧回调不 settle、不修改状态
            if (fileReader !== reader) return;
            fileReader = null;
            settleFilePickOnce(String(reader.result || ''));
          };
          reader.onerror = () => {
            if (fileReader !== reader) return;
            fileReader = null;
            settleFilePickOnce(null);
          };
          reader.onabort = () => {
            if (fileReader !== reader) return;
            fileReader = null;
            settleFilePickOnce(null);
          };
          reader.readAsText(file, 'utf-8');
        };
        fileChangeHandler = onChange;
        input.addEventListener('change', onChange);
        input.click();
      });
    },
    downloadText: (filename, text) => {
      try {
        const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        const timer = window.setTimeout(() => {
          URL.revokeObjectURL(url);
          const idx = downloadUrls.findIndex((u) => u.url === url);
          if (idx >= 0) downloadUrls.splice(idx, 1);
        }, 2000);
        downloadUrls.push({ url, timer });
      } catch {
        /* download blocked */
      }
    },
  });

  const onImportClick = () => void controller?.importJson();
  const onExportClick = () => void controller?.exportJson();
  const onResetClick = () => void controller?.reset();
  const importBtn = document.getElementById('btnMathGraphImport');
  const exportBtn = document.getElementById('btnMathGraphExport');
  const resetBtn = document.getElementById('btnMathGraphReset');
  importBtn?.addEventListener('click', onImportClick);
  exportBtn?.addEventListener('click', onExportClick);
  resetBtn?.addEventListener('click', onResetClick);

  syncSliders();
  ensureMathFloatCardsBound();
  renderFnList();
  syncParamPanel();

  const ro = new ResizeObserver(() => {
    resizeMathBoard(state.board, getStageEl());
    state.notes?.redraw?.();
    schedulePointLabelFusion();
  });
  ro.observe(getStageEl());
  register(() => ro?.disconnect?.());
  const firstFrame = requestAnimationFrame(() => {
    state.firstFrameRaf = null;
    resizeMathBoard(state.board, getStageEl());
    state.notes?.redraw?.();
    schedulePointLabelFusion();
  });
  state.firstFrameRaf = firstFrame;
  register(() => {
    if (state.firstFrameRaf != null) {
      cancelAnimationFrame(state.firstFrameRaf);
      state.firstFrameRaf = null;
    }
  });

  function dispose() {
    importBtn?.removeEventListener('click', onImportClick);
    exportBtn?.removeEventListener('click', onExportClick);
    resetBtn?.removeEventListener('click', onResetClick);
    filePickAborted = true;
    // 等待中的文件选择任务必须 settle（resolve null + 清理 listener/reader），
    // importJson() 才不会永久 pending
    settleFilePickOnce(null);
    for (const item of downloadUrls.splice(0)) {
      window.clearTimeout(item.timer);
      try {
        URL.revokeObjectURL(item.url);
      } catch {
        /* already revoked */
      }
    }
  }

  return { controller, dispose };
}
