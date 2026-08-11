/**
 * Graph 名称编辑：读取/锁定判断、GraphDocument action、runtime 显示名、hooks 生命周期。
 */

/**
 * @param {{
 *   state: any,
 *   setNameEditHooks: (hooks: any) => void,
 *   applyDisplayName: (el: any, name: string) => void,
 *   detectObjectKind: (el: any) => string,
 *   findUserRec: (el: any) => any,
 *   userPointIdOf: (el: any) => string | null,
 * }} deps
 */
export function createGraphNameEditController(deps) {
  const {
    state,
    setNameEditHooks,
    applyDisplayName,
    detectObjectKind,
    findUserRec,
    userPointIdOf,
  } = deps;

  function mount() {
    setNameEditHooks({
      canEditName: (el) => {
        const kind = detectObjectKind(el);
        if (kind !== 'point' && kind !== 'line') return false;
        if (el?._mathFnId || state.functions.some((f) => f.curve === el)) return false;
        if (findUserRec(el)?.locked) return false;
        return true;
      },
      getNameKind: (el) => (detectObjectKind(el) === 'line' ? 'line' : 'point'),
      getName: (el) =>
        String(el?._mathBaseName || el?._mathSelectLabel || (typeof el?.name === 'string' ? el.name : '')),
      setName: (el, formattedName) => {
        const store = state.graphStore;
        const pointId = userPointIdOf(el);
        const kind = detectObjectKind(el);

        if (kind === 'point' && pointId && store) {
          const rec = store.getDocument().points.find((p) => p.id === pointId);
          if (rec?.locked) return;
          applyDisplayName(el, formattedName);
          const runtimeRec = findUserRec(el);
          if (runtimeRec) runtimeRec.baseName = formattedName;
          store.dispatch({
            type: 'point/update',
            payload: { id: pointId, patch: { name: formattedName } },
          });
          return;
        }

        if (kind === 'line' && el?._mathConstrId) {
          applyDisplayName(el, formattedName);
          const constrRec = state.constructions.find((c) => c.id === el._mathConstrId);
          if (constrRec) constrRec.label = formattedName;
          if (store) {
            store.dispatch({
              type: 'construction/update',
              payload: { id: el._mathConstrId, patch: { label: formattedName } },
            });
          }
          return;
        }

        applyDisplayName(el, formattedName);
      },
    });
  }

  function dispose() {
    setNameEditHooks(null);
  }

  return { mount, dispose };
}
