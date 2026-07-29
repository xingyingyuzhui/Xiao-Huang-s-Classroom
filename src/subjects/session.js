/**
 * 当前学科会话（localStorage）
 */

const KEY = 'xh-classroom-subject';

/** @returns {string | null} */
export function getCurrentSubjectId() {
  try {
    const id = localStorage.getItem(KEY);
    return id || null;
  } catch {
    return null;
  }
}

/** @param {string | null} id */
export function setCurrentSubjectId(id) {
  try {
    if (!id) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, id);
  } catch {
    /* ignore quota */
  }
}
