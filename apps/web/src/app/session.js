/**
 * App session（spec §9.1）：轻量、可测试的应用会话状态。
 *
 * 只存 shell 级状态（surface/subjectId/panelId/transition/dialog）；
 * 学科领域状态不进 session。
 */
export const SURFACES = ['hub', 'intro', 'classroom'];

export function createAppSession(initial = {}) {
  let state = {
    surface: 'hub',
    subjectId: null,
    panelId: null,
    transition: 'idle', // idle | entering | leaving
    dialog: null,
    ...initial,
  };
  const listeners = new Set();

  function set(patch) {
    state = { ...state, ...patch };
    for (const fn of listeners) fn(state);
  }

  return {
    getState: () => ({ ...state }),
    /** 进入学科 intro（hub → intro） */
    enterIntro(subjectId) {
      if (!subjectId) return false;
      set({ surface: 'intro', subjectId, panelId: null, transition: 'entering' });
      return true;
    },
    /** 进入课堂（intro → classroom） */
    enterClassroom(panelId) {
      set({ surface: 'classroom', panelId: panelId ?? null, transition: 'entering' });
    },
    /** 返回大厅（任何 surface → hub） */
    returnHub() {
      set({ surface: 'hub', subjectId: null, panelId: null, transition: 'leaving' });
    },
    setTransition(t) {
      set({ transition: t });
    },
    setPanel(panelId) {
      set({ panelId });
    },
    openDialog(id) {
      set({ dialog: id });
    },
    closeDialog() {
      set({ dialog: null });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
