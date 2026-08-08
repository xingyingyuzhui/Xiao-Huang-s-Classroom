/**
 * 当前学科会话（localStorage）
 */

const KEY = 'xh-classroom-subject';

export function getCurrentSubjectId(): string | null {
  try {
    const id = localStorage.getItem(KEY);
    return id || null;
  } catch {
    return null;
  }
}

export function setCurrentSubjectId(id: string | null): void {
  try {
    if (!id) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, id);
  } catch {
    /* ignore quota */
  }
}
