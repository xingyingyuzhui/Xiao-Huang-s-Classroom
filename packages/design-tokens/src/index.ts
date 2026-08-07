/**
 * 语义设计令牌（Program 3 Task 3.2）。
 * 值表由 scripts 从五主题 tokens.css 生成（theme-values.generated.json），
 * 语义名是唯一稳定键；禁止 feature 按主题 id 写业务分支。
 * 契约：五主题全覆盖、语义名唯一、与 tokens.css 防漂移对照。
 */
import themeValues from './theme-values.generated.json' with { type: 'json' };

export const THEME_IDS = ['default', 'blackboard', 'pixel', 'reagent', 'stationery'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export type SemanticTokenName = keyof (typeof themeValues)[ThemeId];

const allNames = new Set<string>();
for (const theme of THEME_IDS) {
  for (const name of Object.keys(themeValues[theme])) allNames.add(name);
}

/** 所有语义名（按主题表并集，保证唯一）。 */
export function allSemanticNames(): string[] {
  return [...allNames];
}

/** 某主题的语义值表。 */
export function themeTokens(theme: ThemeId): Record<SemanticTokenName, string> {
  return themeValues[theme] as Record<SemanticTokenName, string>;
}

export { themeValues };
