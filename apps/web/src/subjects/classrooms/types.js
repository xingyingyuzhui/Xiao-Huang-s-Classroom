/**
 * 学科教室契约：每科独立 Tab / 面板 / 进入离开生命周期
 *
 * @typedef {{ id: string, label: string }} DefaultPageOption
 *
 * @typedef {{
 *   isStale: () => boolean,
 *   getDefaultPage?: (subjectId: string) => Promise<string>,
 * }} ClassroomEnterContext
 *
 * @typedef {{
 *   subjectId: string,
 *   showTabBar: boolean,
 *   panelKeys: string[],
 *   defaultPageOptions: DefaultPageOption[],
 *   defaultTabId: string,
 *   boot: () => void | Promise<void>,
 *   enter: (ctx: ClassroomEnterContext) => Promise<void>,
 *   leave: () => void,
 *   hidePanels: () => void,
 *   switchTab: (tabId: string) => Promise<void>,
 *   onResize: () => void,
 *   onSideDrawerToggle: (key: string, collapsed: boolean) => void,
 *   onAppRevealed?: () => void | Promise<void>,
 *   capabilities: { brand: boolean, defaultPage: boolean, ai: boolean },
 * }} SubjectClassroom
 */

export {};
