/**
 * Theme cover asset map — five packs (v1–v5) aligned with THEME_CATALOG order.
 */

export const COVER_ASSET_STEM = {
  chemistry: 'chemistry',
  physics: 'physics',
  biology: 'biology',
  math: 'mathematics',
};

export const THEME_COVER_VERSION = {
  default: 1,
  stationery: 2,
  reagent: 3,
  blackboard: 4,
  pixel: 5,
};

/**
 * @param {string} themeId
 * @param {string} subjectId
 * @returns {string | null}
 */
export function coverUrlForTheme(themeId, subjectId) {
  const ver = THEME_COVER_VERSION[themeId] || THEME_COVER_VERSION.default;
  const stem = COVER_ASSET_STEM[subjectId];
  if (!stem) return null;
  return `/assets/subject-covers/${stem}-cover-v${ver}.png`;
}
